import "server-only";

import type { Prisma } from "@/generated/prisma";
import { convergeLegacyVotes, resolveDayVote, type DayVoteOutcome } from "@/lib/mafia-rules";
import type { IceRole } from "@/lib/types";
import { ICE_RESULT_CODES, mafiaOutcome } from "./rules";

/**
 * 마피아 낮 투표의 **결과를 적용한다.**
 *
 * ## 왜 액션 밖인가
 *
 * 이 일을 하는 로직은 전부 순수 판정(`resolveDayVote`)과 "무엇을 저장할지" 로 나뉘는데, 적용
 * 쪽만 `"use server"` 파일 안에 있었다. 그 결과 이 파일의 export 는 전부 서버 액션이라 **세션 없이
 * 부를 수 없었고**, 그래서 "결선을 만들었을 때 다리 표가 비워지는가" 를 실제 DB 로 확인할 방법이
 * 없었다. 대신 소스 정규식을 썼고, 그 정규식이 **이 분기의 누락을 통과시켰다**(2026-09-30).
 *
 * 여기서는 세션도 액션도 없다. 트랜잭션 클라이언트만 받아 같은 일을 하므로, `smoke.mts` 가 이
 * 함수를 **진짜 DB 위에서** 부를 수 있다.
 */

/** 이 판의 표와 다리 값 — 순수 판정에 필요한 최소한의 것. */
export type DayVoteInput = {
  roundId: string;
  game: string;
  /** 마피아 판의 `voteSeq`. 결선은 새 회차다. */
  voteSeq: number;
  /** 이번 투표에서 지금까지 결선을 몇 번 했는가. */
  runoffCount: number;
  /** 결선이 아니면 빈 배열. */
  eligibleTargets: string[];
  /** 몇 번째 낮인가. */
  day: number;
  /** 살아 있는 자리. 승패 판정에도 쓰므로 **역할**을 함께 받는다. */
  alive: { memberId: string; role: IceRole }[];
  /** 지금 회차의 표. */
  ballots: { memberId: string; targetId: string }[];
  /** 자리별 다리 칸. **구버전이 던진 표가 여기만 남아 있을 수 있다.** */
  legacy: { memberId: string; voteForId: string | null }[];
};

/**
 * 사회자에게 돌려줄 말. **없으면 `undefined`** — 액션의 다른 길들이 `undefined` 로 "말 없음" 을
 * 말하는 것과 같은 표기라, 반환형이 갈리면 호출부마다 `?? ""` 가 붙는다.
 */
export type DayVoteMessage = string | undefined;

/**
 * 다리 정리 — 구버전이 보는 `IceSeat.voteForId`.
 *
 * 이 칸은 **구버전 인스턴스가 아직 트래픽을 받는 동안** 그 판을 마감할 수 있게 하는 다리다
 * (`20260930210000`). 새 판정은 표 기록(`IceBallot`)만 읽기 때문에, 여기서는 쓰기만 한다.
 */
export async function clearBridgeVotes(
  tx: Prisma.TransactionClient,
  roundId: string,
  targetId?: string,
): Promise<void> {
  if (targetId === undefined) {
    await tx.iceSeat.updateMany({ where: { roundId }, data: { voteForId: null } });
    return;
  }
  await tx.iceSeat.updateMany({
    where: { roundId, OR: [{ memberId: targetId }, { voteForId: targetId }] },
    data: { voteForId: null },
  });
}

/**
 * 표를 모은다 — **구버전이 던진 표까지 흡수한다.**
 *
 * 다리는 신버전 → 구버전 방향으로만 통하므로, 배포가 끝나기 전 구버전이 쓴 표는 다리 칸에만 남아
 * 있다. 여기서 표 기록으로 접지 않으면 사용자가 실제로 누른 표가 **사라진 것처럼 보인다.**
 *
 * 흡수한 표는 **실제로 저장한다** — 결과 화면의 "누가 누구에게 표를 던졌는지" 에 남아야 하기
 * 때문이다. 판정은 하지 않는다(후보 밖의 표는 `resolveDayVote` 가 거른다).
 */
export async function collectDayBallots(
  tx: Prisma.TransactionClient,
  input: Pick<DayVoteInput, "roundId" | "voteSeq" | "day" | "ballots" | "legacy">,
): Promise<{ memberId: string; targetId: string }[]> {
  const { merged, added } = convergeLegacyVotes(input.ballots, input.legacy);
  if (added.length === 0) return merged;
  await tx.iceBallot.createMany({
    data: added.map((b) => ({ roundId: input.roundId, seq: input.voteSeq, day: input.day, ...b })),
  });
  return merged;
}

/**
 * 마피아 낮 투표의 결론을 **적용한다.**
 *
 * 반환하는 말은 사회자 화면에 그대로 나간다 — "아무도 탈락하지 않았다" 같은 실패를 문장으로
 * 남기는 곳이 두 벌이 되면 어느 쪽이 맞는지 알 수 없기 때문이다.
 */
export async function applyMafiaDayVote(
  tx: Prisma.TransactionClient,
  input: DayVoteInput,
): Promise<DayVoteMessage> {
  const ballots = await collectDayBallots(tx, input);

  const aliveIds = new Set(input.alive.map((s) => s.memberId));
  const eligible =
    input.eligibleTargets.length > 0 ? input.eligibleTargets.filter((id) => aliveIds.has(id)) : [...aliveIds];
  const vote: DayVoteOutcome = resolveDayVote({ ballots, eligible, runoffs: input.runoffCount });

  if (vote.kind === "noVote") {
    // 승부가 나지 않았다. **토론으로 되돌린다** — 같은 표로 재투표하게 두지 않는다.
    await clearBridgeVotes(tx, input.roundId);
    await tx.iceRound.update({
      where: { id: input.roundId },
      data: { phase: "discussion", eligibleTargets: [], phaseStartedAt: new Date() },
    });
    return "아직 아무도 투표하지 않았습니다. 이야기를 나눈 뒤 다시 투표해 주세요.";
  }

  if (vote.kind === "runoff") {
    // **동점자끼리만** 다시 투표한다. 결선은 새 회차다 — 같은 회차로 두면 결선 앞의 표가
    // 결선 표에 덮어써져 "누가 누구에게 표를 던졌는가" 가 그 낮의 표만 남는다.
    //
    // ⚠️ 다리를 **반드시** 비운다. 안 비우면 `IceBallot` 은 새 회차로 넘어갔는데 다리 칸에는 직전
    //    일반투표의 표가 남고, 구버전이 마감하면 **지난 표를 결선 표로 세어** 결선 밖의 사람이
    //    탈락한다(2026-09-30 · 짚어진 결함 2).
    await clearBridgeVotes(tx, input.roundId);
    await tx.iceRound.update({
      where: { id: input.roundId },
      data: {
        voteSeq: input.voteSeq + 1,
        runoffCount: input.runoffCount + 1,
        eligibleTargets: vote.candidates,
        phaseStartedAt: new Date(),
      },
    });
    return `동점입니다. ${vote.candidates.length}명끼리 다시 투표합니다.`;
  }

  if (vote.kind === "stuck") {
    // 결선을 해도 동점이다. 아무도 빠지지 않고 **전체 후보로 돌아간다** — 여기서 또 좁히면
    // 무한 반복이다.
    await clearBridgeVotes(tx, input.roundId);
    await tx.iceRound.update({
      where: { id: input.roundId },
      data: { phase: "discussion", eligibleTargets: [], phaseStartedAt: new Date() },
    });
    return "결선을 해도 동점입니다. 아무도 탈락하지 않습니다. 이야기를 더 나눈 뒤 다시 투표해 주세요.";
  }

  await tx.iceSeat.update({
    where: { roundId_memberId: { roundId: input.roundId, memberId: vote.targetId } },
    data: { outAt: new Date(), outHow: "vote", outDay: input.day },
  });
  await clearBridgeVotes(tx, input.roundId);

  // 승패는 **처형 후** 살아 있는 자리의 역할로 판정한다.
  const code = mafiaOutcome(
    input.alive.filter((s) => s.memberId !== vote.targetId).map((s) => s.role),
  );
  if (code) {
    await tx.iceRound.update({
      where: { id: input.roundId },
      data: {
        phase: "revealed",
        resultCode: code,
        winner: code === ICE_RESULT_CODES.mafiaWin ? "mafia" : "citizen",
        eligibleTargets: [],
        phaseStartedAt: new Date(),
      },
    });
    return undefined;
  }

  // 끝나지 않았으면 **밤이 곧바로 온다** — 밤 번호가 하나 올라가고, 후보는 처음부터 다시 넓어진다.
  await tx.iceRound.update({
    where: { id: input.roundId },
    data: { phase: "night", day: input.day + 1, eligibleTargets: [], phaseStartedAt: new Date() },
  });
  return undefined;
}