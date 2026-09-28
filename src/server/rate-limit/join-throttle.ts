import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { clientGate, JOIN_LIMIT, teamGate, type JoinGate } from "./policy";
import { hitWindow } from "./window";

/**
 * **가입 신청**(`joinTeam`)의 abuse 방어.
 *
 * 재입장 tries(`auth/attempts.ts`)와 **다른 위험**을 막는다. 거기는 "맞힐 코드를 너무 많이
 * 찍는다"를 세었고, 여기는 "**팀장에게 알림을 계속 울린다**"를 센다. 초대 코드는 6자리라
 * 맞히기가 힘들어도, **알고 있는 사람에게는 공개된 값**이므로 알림 폭탄에는 코드 길이가
 * 아무런 저항이 되지 않는다.
 *
 * 지난 경로:
 * `joinTeam` 은 이름만 바꿔 가며 제한 없이 새 요청을 만들 수 있었다. 요청 하나마다
 * `Notification` 행이 생기고 **웹푸시**가 나가므로, 팀 코드 하나를 아는 사람이 특정 팀장
 * 하나를 대상으로 알림과 푸시 비용을 무한히 태울 수 있었다. 코드가 6자리라서 안전하다는
 * 근거는 **이 경로에는 아예 적용되지 않는다.**
 *
 * 세 층을 두는 이유, 그리고 각각의 숫자가 다른 이유:
 * 1. `client`   — 이 브라우저 기준. 빠른 반복을 먼저 멈춘다.
 * 2. `teamCreate` — 쿠키를 지우면 1번을 그대로 지난다. **그래서 두 번째가 진짜 방어선**이다.
 * 3. `teamPush` — 비용. 여기서는 요청을 막지 않고 **푸시만** 막는다.
 *
 * 그리고 시간이 아니라 **개수**로 한 번 더 막는다(`unresolvedPerTeam`) — 느리게 조금씩
 * 신청하면 시간 제한을 한 번도 넘지 않으면서 팀장 목록을 채울 수 있다.
 */

/**
 * 익명 브라우저 식별자.
 *
 * 아직 로그인한 사람이 아니므로 **신원이 아니다.** 같은 기기에서 오는 반복을 묶는 용도일
 * 뿐이고, 이를 곧장 신원처럼 쓰면 안 된다.
 *
 * ⚠️ **이 쿠키를 지우면 1번 제한은 그대로 통과한다.** 그래서 이 파일의 진짜 방어선은
 * 2번(팀 예산)이다. IP 를 영구 식별자로 붙이는 쪽은 고르지 않았다 — 프록시 헤더를 신뢰해야
 * 하고, 저장하면 개인 데이터가 된다. `RejoinAttempt` 도 이 저장소 정책에 따라 IP 를 담지
 * 않는다(`auth/attempts.ts` 머리말의 "남는 위험").
 */
const ANON_COOKIE = "cd_anon";
const ANON_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * 키를 만든다.
 *
 * 재입장 tries 키(`sha256("<코드>:<이름>")`)와 절대 같은 칸을 쓰지 않도록 `join:` 으로
 * 범위를 묶는다. 해시가 다르면 우연히 겹치진 않지만, **같은 칸을 의도적으로 공유하지 않는다**
 * 는 사실을 코드로 남기는 편이 낫다.
 *
 * 범위 문자열에 대상을 다 넣는다 — 창 이름과 대상을 따로 받는 대신, 호출부에서 한 조각으로
 * 만들어야 "같은 대상인데 다른 창"과 "다른 대상인데 같은 창"이 섞이지 않는다.
 */
function windowKey(scope: string): string {
  return createHash("sha256").update(`join:${scope}`).digest("hex");
}

/** 이 브라우저를 나타내는 값. 없으면 새로 만들어 심는다. */
async function anonId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  if (existing) return existing;

  const fresh = randomUUID();
  store.set(ANON_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANON_MAX_AGE,
  });
  return fresh;
}

/**
 * 팀에 쌓여 있는 미해결 요청 수.
 *
 * `approved` 도 센다 — 승인됐지만 요청한 브라우저가 아직 회수하지(`checkJoinApproval`) 않은
 * 행은 사실상 아직 끝나지 않은 요청이고, 그 사이에 새 이름을 계속 넣으면 팀장이 보지도 않는
 * 이름이 쌓인다.
 */
export async function countUnresolved(teamId: string): Promise<number> {
  return db.joinRequest.count({
    where: { teamId, status: { in: ["pending", "approved"] } },
  });
}

/**
 * 1단계 — 이 브라우저의 빠른 반복.
 *
 * **모든 요청 길에서 부른다** — 이미 있는 요청을 다시 내는 것까지 포함한다. 이 브라우저가 유독
 * 많이 찍는 것을 멈추는 것이 목적이고, 그 판단에 팀 예산은 필요하지 않다.
 */
export async function takeClientAttempt(): Promise<JoinGate> {
  const id = await anonId();
  const clientShort = await hitWindow(
    windowKey(`src-10m:${id}`),
    JOIN_LIMIT.client.short.windowMs,
  );
  const clientLong = await hitWindow(
    windowKey(`src-1h:${id}`),
    JOIN_LIMIT.client.long.windowMs,
  );
  return clientGate(clientShort, clientLong);
}

/**
 * 2·4단계 — 이 팀이 **새 요청을 하나 더 만들 수 있는가.**
 *
 * ## 새 요청을 실제로 만들 때만 불러라
 *
 * 이미 있는 요청을 다시 내거나(소유자), 남의 이름에 부딪히면(`taken`) 여기에도 오면 안 된다.
 * 그러면 정상 사용자가 자기 요청을 고칠 때마다 팀 예산이 깎이고 — 그건 방어가 아니라 **자기
 * 요청을 다시 여는 사람을 잠그고**, 더 나쁘면 공개된 팀 코드를 아는 사람이 그 숫자만 잘
 * 먹여 팀 전체의 신규 가입을 막는다. `teamGate` 의 전제가 "새로 만들 수 있을 때만 판정한다" 이다.
 *
 * 그래서 호출부는 **이미 요청이 없다는 걸 확인한 뒤에** 이 함수를 부른다.
 */
export async function takeTeamCreation(teamId: string): Promise<JoinGate> {
  const teamShort = await hitWindow(
    windowKey(`team-create-10m:${teamId}`),
    JOIN_LIMIT.teamCreate.short.windowMs,
  );
  const teamLong = await hitWindow(
    windowKey(`team-create-1h:${teamId}`),
    JOIN_LIMIT.teamCreate.long.windowMs,
  );
  const unresolved = await countUnresolved(teamId);
  return teamGate(teamShort, teamLong, unresolved);
}

/**
 * 3단계 — 팀장에게 **푸시**를 보낼 자리가 남았는가.
 *
 * 막혔을 때 하는 일은 **푸시만 빠뜨리는 것**이다. `Notification` 행은 그대로 둔다 — 앱을
 * 열면 알림함에서 반드시 보이므로("놓치는 일의 대부분은 '나한테 온 줄 몰랐다'"), 이것까지
 * 없애면 팀장은 공격이 있었다는 사실조차 알 수 없다.
 *
 * 두 창은 **항상 둘 다 찍는다.** 1분 창에서 막혔다고 10분 창을 건너뛰면 10분 쪽 횟수가
 * 실제보다 작게 남아서, 막힌 사람이 1분 뒤에 몰리면 정작 10분 제한을 통과한다.
 */
export async function takePushSlot(teamId: string): Promise<boolean> {
  const burst = await hitWindow(
    windowKey(`team-push-1m:${teamId}`),
    JOIN_LIMIT.teamPush.burst.windowMs,
  );
  const short = await hitWindow(
    windowKey(`team-push-10m:${teamId}`),
    JOIN_LIMIT.teamPush.short.windowMs,
  );
  return (
    burst <= JOIN_LIMIT.teamPush.burst.max && short <= JOIN_LIMIT.teamPush.short.max
  );
}
