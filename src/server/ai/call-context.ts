import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { db } from "@/server/db";

/**
 * **지금 이 호출을 누가 하고 있는지** 를 모델 층까지 전달하는 통로.
 *
 * ## 왜 이런 게 필요한가
 *
 * 계측(`AiCall`)에 필요한 값이 두 층에 나뉘어 있다.
 * - **모델 층**(`model.ts`) — 어느 모델로, 몇 초 걸렸나, 실패했나. 그리고 폴백을 탔나.
 * - **호출 층**(`run.ts`) — 팀이 누구인가(세션에 있다).
 *
 * 모델 층이 **팀·팀원을 모른다** — 그건 `run.ts` 만 안다. 그래서 값을 위로 올리거나
 * (`run.ts` 가 모델 층의 모든 반환값을 해석해야 한다), 아래로 내리거나(모든 도구 함수에
 * `me` 를 넣어야 한다) 해야 한다. 아래로 내리는 쪽은 **여섯 함수의 시그니처와 그 callers 를
 * 다 바꿔야** 하고 — 그때마다 한 곳을 빠뜨리면 계측이 조용히 빠진 채로 배포된다.
 *
 * 그래서 이 통로를 쓴다. `run.ts` 가 `withAiCaller` 한 번 감싸면, 그 아래에서 일어나는 모델
 * 호출이 스스로 "누구의 것인지" 알 수 있다. **넣어야 하는 값이 한 곳뿐이면 빠뜨릴 수 없다.**
 *
 * ## 왜 `AsyncLocalStorage` 인가 — 전역 변수로 두면 안 되는 이유
 *
 * 서버 프로세스 하나에서 **두 사람의 AI 호출이 동시에** 간다. `let currentMe` 같은 전역에
 * 넣어 두면, A 의 호출이 B 의 계측에 B 의 이름으로 기록된다. 재고 없이 "누가 무슨 말을
 * 보냈다" 는 기록이 조용히 엉뚱해지는 사고다. `AsyncLocalStorage` 는 **비동기 흐름마다
 * 따로** 값을 붙여 주므로 그 일이 없다.
 *
 * ## `lastCallId` 는 왜 있는가
 *
 * **거절은 모델 층이 모른다.** 모델이 "심한 욕설은 못 하겠다" 고 *대답*한 것은 성공이다
 * (`throw` 가 아니다). 근데 그건 이 도구가 일을 하지 못한 거다 — 계측에서 `ok` 와 다른
 * 값이어야 한다("모델을 바꿔야 한다" vs "다시 시도하면 된다"). 판정할 수 있는 곳은
 * **결과를 읽는 호출 층**뿐이라, 거기서 이 id 를 보고 그 행을 `refused` 로 고친다.
 *
 * **누가 쓴 사실만 알면 충분한 값이다**(무엇을 말했는지는 남지 않는다).
 */
export type AiCaller = {
  teamId: string;
  memberId: string;
};

type AiCallContext = {
  caller: AiCaller;
  /** 모델 층이 방금 적은 `AiCall` 행. 거절 판정 뒤 여기서 고친다. */
  lastCallId: string | null;
};

const store = new AsyncLocalStorage<AiCallContext>();

/** 이 안에서 일어나는 AI 호출은 `caller` 의 것으로 기록된다. */
export function withAiCaller<T>(caller: AiCaller, run: () => Promise<T>): Promise<T> {
  return store.run({ caller, lastCallId: null }, run);
}

/** 지금 호출의 주인. 모델 층·계측이 쓴다. 세션 밖(벤치·예약 작업)에서는 `null`. */
export function currentAiCaller(): AiCaller | null {
  return store.getStore()?.caller ?? null;
}

/** 방금 적은 계측 행의 id — 거절로 고칠 때 쓴다. */
export function noteCallWritten(id: string): void {
  const ctx = store.getStore();
  if (ctx) ctx.lastCallId = id;
}

/**
 * 방금 적은 행을 **거절**로 고친다.
 *
 * 모델이 답을 줬지만 이 도구가 일을 하지 못했을 때만 부른다. 부르지 않으면 계측이
 * "성공"으로 남고, 모델을 바꿔야 할 문제를 "다시 눌러라" 고 안내하게 된다.
 */
export function markLastCallRefused(): void {
  const ctx = store.getStore();
  if (!ctx?.lastCallId) return;
  void db
    .aiCall.update({ where: { id: ctx.lastCallId }, data: { outcome: "refused" } })
    .catch((cause: unknown) => console.error("[ai] 계측을 거절로 고치지 못했습니다:", cause));
}
