import "server-only";

import { db } from "@/server/db";

/**
 * 기여 기록의 상태 규칙 — **한 곳에서만 정한다.**
 *
 * 세 가지가 상태를 바꾼다: 팀원의 확인, 누군가 적은 의견, 그 의견에 대한 응답.
 * 각자 고치면 "확인 3명인데 대기 중" 같은 어긋남이 생기므로, 무엇이 바뀌든
 * 이 함수를 다시 불러 계산한다.
 *
 * 규칙:
 * - 적힌 의견이 있고 아직 정리되지 않았으면 **의견 차이**. 확인 수와 무관하다 —
 *   사실이 다투어지는 중에 "확인됨"으로 보이면 안 된다.
 * - 필요한 수만큼 확인했으면 **확인됨**.
 * - 그보다 적으면 **대기**.
 *
 * **몇 명이 필요한지는 팀이 정한다**(`Team.confirmsNeeded`). 예전에는 코드의 상수였고,
 * 그 값이 바뀌려면 코드를 고쳐 배포해야 했다. 1이 기본인 이유: 전원으로 두면 한 사람이
 * 답하지 않을 때 영영 확정되지 않는다.
 */

/** 팀이 아직 정하지 않았을 때의 값. */
export const DEFAULT_CONFIRMS_NEEDED = 1;

/**
 * 올릴 수 있는 최댓값.
 *
 * **자기 기록은 자기 자신이 확인하지 못한다**(17 화면의 규칙). 그래서 팀이 N명이면
 * 기록 하나가 모을 수 있는 확인은 최대 N-1명이다. 이 값을 넘는 기준은 아무도 채울 수 없는
 * 기준이라, 서버가 거절한다.
 */
export function maxConfirmsNeeded(activeMemberCount: number): number {
  return Math.max(DEFAULT_CONFIRMS_NEEDED, activeMemberCount - 1);
}

export type ContribState = "ok" | "pending" | "disputed";

/**
 * 정정에 응답할 수 있는 사람.
 *
 * **기록 주인과 지금 의견을 적은 사람뿐이다.** 전원이 응답하면 "기록을 고칠 권리"가
 *ubi 무효가 된다 — 아무나 남긴 의견에 아무나 답할 수 있으면 결정이 되지 않는다.
 * 지금 떠 있는 의견(`dispute`)에 대한 응답이므로, 정리되고 뒤에 남은 의견은 아무도
 * 답할 수 없다.
 *
 * 화면(17)의 "정정에 응답하기" 버튼과 서버 액션이 **같은 함수**를 쓴다 — 화면이 숨긴
 * 것을 서버가 따로 판단하면, 어떤 경로로 호출하�� 들어갈 수 있다.
 */
export function canResolveContrib(input: {
  /** 기록 주인. */
  memberId: string;
  /** 지금 의견을 적은 사람. 의견이 정리되면 null 이 된다. */
  disputedById: string | null;
  meId: string;
}): boolean {
  return input.meId === input.memberId || input.meId === input.disputedById;
}

export function contribState(input: {
  confirms: number;
  dispute: string | null;
  resolution: string | null;
  /** 필요한 확인 수. 팀이 정한 값(`Team.confirmsNeeded`). */
  needed: number;
}): ContribState {
  if (input.dispute && !input.resolution) return "disputed";
  return input.confirms >= input.needed ? "ok" : "pending";
}

/** 표에 저장된 `state` 를 다시 계산해 맞춘다. 기록을 건드린 액션이 마지막에 부른다. */
export async function refreshContribState(recordId: string): Promise<ContribState> {
  const record = await db.contribRecord.findUnique({
    where: { id: recordId },
    select: {
      dispute: true,
      resolution: true,
      _count: { select: { confirms: true } },
      // 기준은 팀에 있다 — 기록마다 들고 다닐 값이 아니다.
      member: { select: { team: { select: { confirmsNeeded: true } } } },
    },
  });
  if (!record) throw new Error("기록을 찾을 수 없습니다.");

  const state = contribState({
    confirms: record._count.confirms,
    dispute: record.dispute,
    resolution: record.resolution,
    needed: record.member.team.confirmsNeeded,
  });

  await db.contribRecord.update({ where: { id: recordId }, data: { state } });
  return state;
}

/** 화면에 보일 확인 상태 문구. 저장하지 않고 그때그때 만든다. */
export function contribByLabel(input: {
  state: ContribState;
  confirms: number;
  /** 필요한 수. 2명 이상일 때만 분모를 보여 준다 — 1/1은 숫자만 늘어난다. */
  needed: number;
  disputedBy: string | null;
}): string {
  if (input.state === "disputed") {
    return input.disputedBy ? `${input.disputedBy} · 의견 차이 1건` : "의견 차이 1건";
  }
  if (input.confirms === 0) return "팀원 확인 대기";
  return input.needed > 1 ? `${input.confirms}/${input.needed}명 확인` : `${input.confirms}명 확인`;
}
