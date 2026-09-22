import "server-only";

import { AI_POLICY } from "@/data/catalog";
import { db } from "@/server/db";
import type { SessionMember } from "@/server/session";

/**
 * AI 도구의 하루 한도.
 *
 * 왜 필요한가: 도구 5종은 호출마다 실제로 돈이 든다. 지금까지 문은 "팀원인가" 하나뿐이라,
 * 한 사람이 화면을 열어 두고 계속 고쳐 쓰기만 해도(쿠션 번역기·문장 변환은 입력이 멎을
 * 때마다 한 번씩 부른다) 비용에 바닥이 없었다.
 *
 * 세는 것은 **횟수뿐이다.** 입력한 글도 결과도 남기지 않는다 — 한도를 세는 데 필요하지
 * 않고, 남기기 시작하면 "무엇을 얼마나 보관하는지"가 곧 지켜야 할 약속이 된다.
 *
 * 한도 수치는 `AI_POLICY` 에 있고 아직 확정되지 않은 값이다.
 */

/** `AI_TOOLS` 의 key 와 같은 어휘다. 화면·표·집계가 같은 이름을 쓴다. */
export type AiToolKey = "cushion" | "clerk" | "research" | "present" | "sentence";

/** 하루의 기준은 한국 날짜다 — 서버가 어디서 돌든 같은 하루여야 한다. */
function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/**
 * 한 번 쓸 수 있는지 보고, 쓸 수 있으면 썼다고 적는다.
 *
 * 세는 것과 쓰는 것을 한 함수에 둔 이유: 부르는 쪽이 둘 중 하나를 빠뜨리면 한도가
 * 조용히 사라진다. 모델을 부르기 **전에** 적는다 — 실패한 호출도 비용과 시간이 들었고,
 * 실패를 공짜로 두면 실패하는 요청을 무한히 보낼 수 있다.
 *
 * 한도를 넘으면 `message` 를 돌려준다. 화면이 그대로 보여 줄 문장이다.
 */
export async function consumeAiQuota(
  me: SessionMember,
  tool: AiToolKey,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const day = todayInSeoul();

  const [teamUsed, mineUsed] = await Promise.all([
    db.aiUsage.count({ where: { teamId: me.teamId, day } }),
    db.aiUsage.count({ where: { memberId: me.id, day } }),
  ]);

  if (teamUsed >= AI_POLICY.perTeamPerDay) {
    return {
      ok: false,
      message: `오늘 팀이 쓸 수 있는 AI 횟수(${AI_POLICY.perTeamPerDay}회)를 다 썼습니다. 내일 0시(한국)에 다시 채워집니다.`,
    };
  }

  if (mineUsed >= AI_POLICY.perMemberPerDay) {
    return {
      ok: false,
      message: `오늘 내가 쓸 수 있는 AI 횟수(${AI_POLICY.perMemberPerDay}회)를 다 썼습니다. 팀의 남은 횟수와는 별개입니다 — 내일 0시(한국)에 다시 채워집니다.`,
    };
  }

  await db.aiUsage.create({
    data: { teamId: me.teamId, memberId: me.id, tool, day },
  });

  return { ok: true };
}

/**
 * 보관 기간이 지난 사용 기록을 지운다. 예약 작업이 부른다.
 *
 * 허브 화면이 "기록은 N일 뒤 지워집니다"라고 적고 있으므로, 실제로 지우는 곳이 있어야
 * 그 문장이 참이 된다. `day` 는 `YYYY-MM-DD` 라 문자열로 비교해도 날짜 순서와 같다.
 */
export async function sweepAiUsage(): Promise<number> {
  const cutoff = new Date(Date.now() - AI_POLICY.retentionDays * 24 * 60 * 60 * 1000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(cutoff);

  const { count } = await db.aiUsage.deleteMany({ where: { day: { lt: day } } });
  return count;
}
