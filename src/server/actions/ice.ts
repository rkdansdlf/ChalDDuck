"use server";

import { randomInt } from "node:crypto";
import { ICE_GAMES } from "@/data/catalog";
import type { Prisma } from "@/generated/prisma";
import {
  canEnterMafiaPhase,
  mayTargetAtNight,
  nightAlreadyStruck,
  nightRoleOf,
  resolveDayVote,
  resolveNight,
} from "@/lib/mafia-rules";
import type { IceGameKey, IceRole, IceView, NightActionKind } from "@/lib/types";
import { db } from "@/server/db";
import {
  ICE_RESULT_CODES,
  canForfeitLiarGuess,
  canVoteNow,
  checkLiarGuess,
  deal,
  liarOf,
  mafiaOutcome,
  resolveLiarVote,
  voteBlockedText,
} from "@/server/ice/rules";
import { icePhase, iceViewFor } from "@/server/ice/view";
import { notify } from "@/server/notify/create";
import { requireSessionMember, type SessionMember } from "@/server/session";

/**
 * 28 아이스브레이킹 서버 액션.
 *
 * 모든 액션은 **바뀐 뒤의 내 화면**을 돌려준다 — 누른 사람은 다음 폴링을 기다리지 않고
 * 바로 결과를 본다. 실패는 던지지 않고 `message` 로 돌려준다(운영 빌드는 던진 오류의
 * 문구를 지운다).
 *
 * 사회자 일(공개·투표 마감·밤 탈락·끝내기)은 판을 연 사람과 팀장만 한다. 한 사람이
 * 사라져도 판이 멈추지 않도록 팀장을 함께 둔다.
 */
export type IceResult = { view: IceView | null; message?: string };

/** 트랜잭션 클라이언트. 트랜잭션 밖에서도(`db`) 부를 수 있게 타입 하나만 둔다. */
type Tx = Prisma.TransactionClient;

async function done(me: SessionMember, message?: string): Promise<IceResult> {
  return { view: await iceViewFor(me), message };
}

/** 진행 중인 판. 사회자 일이면 권한도 본다. */
async function activeRound(me: SessionMember, asHost: boolean) {
  const round = await db.iceRound.findUnique({ where: { activeKey: me.teamId } });
  if (!round) return { round: null, message: "진행 중인 판이 없습니다." } as const;
  if (asHost && round.hostId !== me.id && !me.isLeader) {
    return { round: null, message: "판을 연 사람이나 팀장만 할 수 있습니다." } as const;
  }
  return { round, message: null } as const;
}

/** 화면이 몇 초마다 부른다. */
export async function pollIce(): Promise<IceView | null> {
  return iceViewFor(await requireSessionMember());
}

/** 시작 화면의 체크박스 목록 — 지금 팀에 남아 있는 사람 전부. */
export async function iceRoster(): Promise<{ id: string; name: string }[]> {
  const me = await requireSessionMember();
  const members = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return members;
}

/** 뺄 대상을 모은다 — 최근 제시어와 직전 판의 라이어. 같은 판이 바로 반복되지 않게 한다. */
async function exclusionsFor(teamId: string): Promise<{ recentWords: string[]; previousLiarId: string | null }> {
  const past = await db.iceRound.findMany({
    where: { teamId, game: "liar" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { word: true, seats: { where: { role: "liar" }, select: { memberId: true }, take: 1 } },
  });
  return {
    recentWords: past.flatMap((r) => (r.word ? [r.word] : [])),
    previousLiarId: past[0]?.seats[0]?.memberId ?? null,
  };
}

/**
 * 다리 정리: 구버전이 보는 `IceSeat.voteForId` 를 비운다.
 *
 * ## 왜 새 코드에서도 이걸 하나
 *
 * 이 칸의 유일한 목적은 **구버전 인스턴스가 아직 트래픽을 받는 동안** 그 판을 마감할 수 있게 하는
 * 것이다(2026-09-30). 그런데 구버전도 이 칸을 보고 집계하므로, 새 코드가 표를 지울 때 이 칸을
 * 남겨 두면 **옛 코드로 마감했을 때 지난 표까지 세어** 다른 사람이 빠진다. 옛 코드가 비우던 자리와
 * 같은 자리에서 같은 조건으로 비운다.
 *
 * `targetId` 를 주면 그 사람에게 던진 표도 함께 지운다 — 그 사람은 이미 빠졌으므로.
 */
async function clearBridgeVotes(tx: Tx, roundId: string, targetId?: string): Promise<void> {
  if (targetId === undefined) {
    await tx.iceSeat.updateMany({ where: { roundId }, data: { voteForId: null } });
    return;
  }
  await tx.iceSeat.updateMany({ where: { roundId, OR: [{ memberId: targetId }, { voteForId: targetId }] }, data: { voteForId: null } });
}

/**
 * 참가자 명단을 **다시 확인한다.**
 *
 * 화면이 골라 온 id 를 그대로 믿으면 안 된다 — 한 팀원이 남의 팀 사람 id 를 넣어 다른 팀의
 * 판에 자리를 앉힐 수 있다. 그래서 같은 팀인지 · 팀을 나기지 않았는지 · 중복이 없는지 ·
 * 최소/최대 인원인지를 서버에서 다시 본다.
 *
 * ⚠️ 상한도 **서버에서** 본다. 화면에서만 막으면 남의 요청(또는 낡은 화면)이 상한을 넘겨 온다 —
 * 인원이 프리셋을 넘으면 역할 배분이 조용히 시민으로 바뀌어, 아무도 모르게 다른 판이 열린다.
 */
async function validParticipants(
  teamId: string,
  ids: string[],
  min: number,
  max?: number,
): Promise<{ ids: string[] | null; message: string }> {
  const wanted = [...new Set(ids)];
  if (wanted.length !== ids.length) return { ids: null, message: "같은 사람이 두 번 들어 있습니다." };

  const found = await db.member.findMany({
    where: { id: { in: wanted }, teamId, leftAt: null },
    select: { id: true },
  });
  if (found.length !== wanted.length) return { ids: null, message: "같은 팀에 있는 사람만 넣을 수 있습니다." };
  if (wanted.length < min) return { ids: null, message: `${wanted.length}명으로는 진행할 수 없습니다.` };
  if (max !== undefined && wanted.length > max) {
    return { ids: null, message: `${wanted.length}명으로는 열 수 없습니다. 이 판은 ${max}명까지입니다.` };
  }
  return { ids: wanted, message: "" };
}

/**
 * 자리마다 말할 순서를 1부터 무작위로 정한다.
 *
 * 대화는 오프라인에서 하는데 순서만 앱이 알려 준다 — "누가 먼저 하지" 로 한 번도 넘어가지
 * 않게 하려고. 무작위는 비밀을 나누던 것과 같은 이유로 `crypto.randomInt` 다.
 */
function turnOrders(count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = count - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * 판을 연다.
 *
 * **참가자는 사회자가 고른다.** 예전에는 팀에 등록된 사람 전원이 자동으로 들어와, 오늘 회의에
 * 오지 않은 사람이 라이어가 되는 일이 있었다. 한자리에 모인 사람이 그게 그 자리에서 일어난다.
 *
 * 라이어 판은 첫 단계가 `clue` — 카드를 확인하고 설명한 뒤에 투표가 열린다. 예전에는 시작하는
 * 순간 투표가 열렸다.
 */
export async function startIceRound(game: IceGameKey, participantIds: string[]): Promise<IceResult> {
  const me = await requireSessionMember();

  const spec = ICE_GAMES.find((g) => g.key === game);
  if (!spec?.playable) return done(me, "아직 열 수 없는 게임입니다.");

  const picked = await validParticipants(me.teamId, participantIds, spec.minPlayers, spec.maxPlayers);
  if (!picked.ids) return done(me, picked.message);
  const ids = picked.ids;

  const { roles, topic, word, aliases } = deal(game, ids, await exclusionsFor(me.teamId));
  const order = turnOrders(ids.length);

  try {
    await db.iceRound.create({
      data: {
        teamId: me.teamId,
        activeKey: me.teamId,
        game,
        phase: game === "liar" ? "clue" : "night",
        day: 1,
        topic,
        word,
        aliases,
        hostId: me.id,
        seats: {
          create: [...roles].map(([memberId, role]) => ({
            memberId,
            role,
            turnOrder: game === "liar" ? order[ids.indexOf(memberId)] : null,
          })),
        },
      },
    });
  } catch (error) {
    // `activeKey` 가 겹쳤다 = 누가 먼저 판을 열었다. 그 판을 보여 준다.
    if ((error as { code?: string }).code === "P2002") {
      return done(me, "다른 팀원이 먼저 판을 열었습니다.");
    }
    throw error;
  }

  await notify({
    to: ids,
    kind: "icebreak",
    title: `${me.name}님이 ${spec.name} 판을 열었습니다`,
    body: "내 카드를 확인하세요. 다른 사람에게 보여 주지 마세요.",
    href: "/team/icebreak",
    actorId: me.id,
  });

  return done(me);
}

/**
 * 라이어: 카드 확인이 끝나면 투표를 연다. 마피아: 토론이 끝나면 투표를 연다.
 *
 * **어느 단계에서 열 수 있는지가 단계마다 다르다.** 라이어는 `clue` 에서, 마피아는
 * `discussion` 에서만 열려 있다 — 밤에 투표가 열리면 밤이 없는 판이 된다.
 */
export async function startIceVote(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);

  const game = round.game as IceGameKey;
  const phase = icePhase(game, round.phase);
  const from = game === "liar" ? "clue" : "discussion";
  const to = game === "liar" ? "vote" : "voting";
  if (phase !== from) return done(me, "지금은 투표를 열 수 없습니다.");
  if (game === "mafia" && !canEnterMafiaPhase("discussion", "voting")) return done(me, "지금은 투표를 열 수 없습니다.");

  // ⚠️ **투표 회차를 새로 연다.** 회차가 늘지 않으면 어제 고른 표와 오늘 고른 표가 같은 줄에
  // 부딪혀 서로를 지운다 — "투표를 마감했는데 아무도 안 찬 것" 으로 보인다.
  // 결선 횟수는 0 으로 되돌린다 — 한도는 **이번 투표 안에서** 센다.
  await db.iceRound.updateMany({
    where: { id: round.id, activeKey: me.teamId, phase: round.phase },
    data: {
      phase: to,
      voteSeq: round.voteSeq + 1,
      runoffCount: 0,
      eligibleTargets: [],
      phaseStartedAt: new Date(),
    },
  });
  // 새 회차에는 지난 표가 없다. 다리 칸을 그대로 두면 구버전이 마감할 때 **지난 표를 세어**
  // 엉뚱한 사람이 빠진다 — 옛 코드에는 회차가 없으므로 여기서 한 번에 비운다.
  await clearBridgeVotes(db, round.id);
  return done(me, "이제 투표할 수 있습니다.");
}

/**
 * 투표. 같은 사람을 다시 누르면 취소된다. 투표가 열린 동안에만 바꾼다.
 *
 * **마감과 동시에 들어온 표를 막기 위해** 판의 행을 잠근다.
 *
 * 예전에는 단계를 읽고 → 자리를 확인하고 → 표를 쓰는데 그 사이에 잠금이 없었다. 그 틈에
 * 사회자가 마감을 누르면 ① 표가 계산된 뒤 ② 내 표가 다음 낮에 남는다. 투표했다는 사실은
 * 화면에 남아 있는데 아무도 그것을 세지 않은, 조용히 사라진 한 표가 된다.
 *
 * 잠그고 **다시 읽어서** 이 판이 아직 투표 중인지 확인한 뒤에야 쓴다.
 */
export async function castIceVote(targetId: string): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, false);
  if (!round) return done(me, message);

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    // 예전 판(`play`)도 지금의 단계로 읽는다 — 배포 중이던 판이 투표할 수 없는 판이 되면 안 된다.
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.endedAt) return "이미 끝난 판입니다.";

    const game = fresh.game as IceGameKey;
    const phase = icePhase(game, fresh.phase);
    if (!canVoteNow(game, phase)) return voteBlockedText(game, phase);

    const mine = fresh.seats.find((s) => s.memberId === me.id);
    const target = fresh.seats.find((s) => s.memberId === targetId);

    if (!mine) return "판이 시작된 뒤에 들어와 이번 판은 구경만 할 수 있습니다.";
    if (mine.outAt) return "탈락한 사람은 투표하지 않습니다.";
    if (!target || target.outAt || targetId === me.id) return "그 사람에게는 투표할 수 없습니다.";

    // 결선이면 **동점자만** 고를 수 있다. 이 검사를 빼면 "결선 중" 화면에 다른 사람이 그대로
    // 남아 있고, 그에게 던진 표는 집계에서 조용히 버려진다(탈락은 결선 밖의 사람이 당해 보인다).
    const eligible = fresh.eligibleTargets.filter((id) => id !== targetId || !target!.outAt);
    if (fresh.eligibleTargets.length > 0 && !eligible.includes(targetId)) {
      return "결선 투표입니다 — 동점자 중 한 명에게만 투표할 수 있습니다.";
    }

    const current = await tx.iceBallot.findUnique({
      where: { roundId_seq_memberId: { roundId: fresh.id, seq: fresh.voteSeq, memberId: me.id } },
    });
    // 같은 사람을 다시 누르면 취소된다 — 표는 지우는 대신 **아예 없는 줄로 만든다.**
    // ⚠️ **다리**: 구버전 인스턴스가 이 판을 마감할 수 있다. 그 구버전은 표를 이 칸에서만 보므로
    //   여기에 같이 두지 않으면 표가 0장으로 보이면서 마감되고 아무도 탈락하지 않는다.
    //   구버전이 모두 사라진 다음 배포에서 이 쓰기를 지운다(`20260930210000` 의 주석).
    const bridge = { voteForId: current?.targetId === targetId ? null : targetId };
    if (current?.targetId === targetId) {
      await tx.iceBallot.delete({
        where: { roundId_seq_memberId: { roundId: fresh.id, seq: fresh.voteSeq, memberId: me.id } },
      });
      await tx.iceSeat.update({
        where: { roundId_memberId: { roundId: fresh.id, memberId: me.id } },
        data: bridge,
      });
      return undefined;
    }
    // 이 표가 결선에서 나온 것인지 함께 적는다 — 결과 화면에서 결선 투표와 보통 투표를 구분한다.
    const runoff = fresh.runoffCount > 0;
    await tx.iceBallot.upsert({
      where: { roundId_seq_memberId: { roundId: fresh.id, seq: fresh.voteSeq, memberId: me.id } },
      update: { targetId, day: fresh.day, runoff },
      create: { roundId: fresh.id, seq: fresh.voteSeq, day: fresh.day, memberId: me.id, targetId, runoff },
    });
    await tx.iceSeat.update({
      where: { roundId_memberId: { roundId: fresh.id, memberId: me.id } },
      data: bridge,
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 라이어: 표를 세고 다음 단계를 정한다.
 * 마피아: 낮 투표를 마감한다 — 가장 많이 받은 한 사람이 탈락하고, 끝나지 않았으면 표를 비운다.
 *
 * **동점과 0표는 승패가 아니다.** 예전에는 동점이 곧 라이어 승리가 됐다 — 표를 하나도 못
 * 받은 상태에서 사회자가 "결과 공개"를 눌러도 라이어가 이겼다. 지금은 표를 비우고 다시
 * 투표하라고 한다.
 *
 * 둘이 동시에 누르면 같은 표로 두 번 탈락시킬 수 있어, 판의 행을 잠그고 다시 읽는다.
 */
export async function closeIceVote(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.endedAt) return "이미 끝난 판입니다.";

    const game = fresh.game as IceGameKey;
    if (!canVoteNow(game, icePhase(game, fresh.phase))) return "지금은 투표를 마감할 수 없습니다.";

    const alive = fresh.seats.filter((s) => s.outAt === null);
    const ballots = await tx.iceBallot.findMany({
      where: { roundId: fresh.id, seq: fresh.voteSeq },
      select: { memberId: true, targetId: true },
    });

    if (game === "liar") {
      const outcome = resolveLiarVote(
        ballots.map((b) => b.targetId),
        fresh.seats.map((s) => ({ memberId: s.memberId, role: s.role })),
      );

      if (outcome.kind === "tie") {
        // ⚠️ 예전에는 여기서 표를 지웠다. 그러면 같은 사람들이 같은 이야기를 다시 하고 같은 동점이
        // 되기를 반복했다. 지금은 **지우지 않는다** — 다시 고르면 같은 회차의 그 줄이 바뀐다.
        await clearBridgeVotes(tx, fresh.id);
        return "동점이거나 아직 아무도 투표하지 않았습니다. 이야기를 더 나눈 뒤 다시 투표해 주세요.";
      }

      if (outcome.kind === "liarGuess") {
        // 여기서 곧바로 공개하지 않는다. 라이어에게 마지막 추측을 준다.
        await tx.iceRound.update({
          where: { id: fresh.id },
          data: { phase: "liar_guess", accusedId: outcome.accusedId, phaseStartedAt: new Date() },
        });
        return undefined;
      }

      await tx.iceRound.update({
        where: { id: fresh.id },
        data: {
          phase: "revealed",
          accusedId: outcome.accusedId,
          winner: outcome.winner,
          resultCode: outcome.code,
          phaseStartedAt: new Date(),
        },
      });
      return undefined;
    }

    const aliveIds = new Set(alive.map((s) => s.memberId));
    const eligible =
      fresh.eligibleTargets.length > 0 ? fresh.eligibleTargets.filter((id) => aliveIds.has(id)) : [...aliveIds];
    const vote = resolveDayVote({ ballots, eligible, runoffs: fresh.runoffCount });

    if (vote.kind === "noVote") {
      // 승부가 나지 않았다. **토론으로 되돌린다** — 같은 표로 재투표하게 두지 않는다.
      await clearBridgeVotes(tx, fresh.id);
      await tx.iceRound.update({
        where: { id: fresh.id },
        data: { phase: "discussion", eligibleTargets: [], phaseStartedAt: new Date() },
      });
      return "아직 아무도 투표하지 않았습니다. 이야기를 나눈 뒤 다시 투표해 주세요.";
    }

    if (vote.kind === "runoff") {
      // **동점자끼리만** 다시 투표한다. 결선은 새 회차다 — 같은 회차로 두면 결선 앞의 표가
      // 결선 표에 덮어써져 "누가 누구에게 표를 던졌는가" 가 그 낮의 표만 남는다.
      await tx.iceRound.update({
        where: { id: fresh.id },
        data: { voteSeq: fresh.voteSeq + 1, runoffCount: fresh.runoffCount + 1, eligibleTargets: vote.candidates },
      });
      return `동점입니다. ${vote.candidates.length}명끼리 다시 투표합니다.`;
    }

    if (vote.kind === "stuck") {
      // 결선을 해도 동점이다. 아무도 빠지지 않고 **전체 후보로 돌아간다** — 여기서 또 좁히면
      // 무한 반복이다.
      await clearBridgeVotes(tx, fresh.id);
      await tx.iceRound.update({
        where: { id: fresh.id },
        data: { phase: "discussion", eligibleTargets: [], phaseStartedAt: new Date() },
      });
      return "결선을 해도 동점입니다. 아무도 탈락하지 않습니다. 이야기를 더 나눈 뒤 다시 투표해 주세요.";
    }

    await tx.iceSeat.update({
      where: { roundId_memberId: { roundId: fresh.id, memberId: vote.targetId } },
      data: { outAt: new Date(), outHow: "vote", outDay: fresh.day },
    });
    const code = mafiaOutcome(alive.filter((s) => s.memberId !== vote.targetId).map((s) => s.role as IceRole));
    if (code) {
      // 끝난 판은 마지막 투표를 그대로 남겨 결과 화면에 보여 준다.
      await tx.iceRound.update({
        where: { id: fresh.id },
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
    await clearBridgeVotes(tx, fresh.id);
    // 끝나지 않았으면 **밤이 곧바로 온다** — 밤 번호가 하나 올라가고, 후보는 처음부터 다시 넓어진다.
    await tx.iceRound.update({
      where: { id: fresh.id },
      data: { phase: "night", day: fresh.day + 1, eligibleTargets: [], phaseStartedAt: new Date() },
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 라이어의 최종 추측.
 *
 * **라이어 본인이 낸다.** 예전에는 "라이어가 제시어를 맞혀 보세요" 문구만 있고 받을 입구가
 * 없어서, 사회자가 "맞았다/틀렸다"를 눌러야 했다. 그러면 사회자도 모르는 판을 임의로 확정하게
 * 된다. 지금은 라이어가 폰에 직접 쓰고 **서버가 판정한다.**
 *
 * 한 번만 낼 수 있다 — 판의 행을 잠근 뒤 `liarGuess` 가 이미 있는지 본다.
 */
export async function submitLiarGuess(guess: string): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, false);
  if (!round) return done(me, message);

  const text = guess.trim();
  if (!text) return done(me, "제시어를 입력해 주세요.");
  if (text.length > 20) return done(me, "20자 이내로 적어 주세요.");

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.endedAt) return "이미 끝난 판입니다.";
    if (fresh.game !== "liar" || fresh.phase !== "liar_guess") return "아직 최종 답을 낼 차례가 아닙니다.";
    if (fresh.liarGuess !== null) return "이미 답을 냈습니다.";
    if (liarOf(fresh.seats) !== me.id) return "라이어만 낼 수 있습니다.";

    const correct = checkLiarGuess(text, fresh.word ?? "", fresh.aliases);
    await tx.iceRound.update({
      where: { id: fresh.id },
      data: {
        phase: "revealed",
        liarGuess: text,
        guessCorrect: correct,
        winner: correct ? "liar" : "citizen",
        resultCode: correct ? ICE_RESULT_CODES.liarGuessed : ICE_RESULT_CODES.liarCaught,
        phaseStartedAt: new Date(),
      },
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 사회자가 **라이어의 기권**을 선언한다 — 라이어가 최종 답을 내지 못한 채 판을 끝낸다.
 *
 * ## 왜 시계가 아니라 사람의 판단인가
 *
 * 라이어는 사회자 바로 옆에 앉아 폰을 들고 있다. 초읽기를 두면 그 사이는 "얼른 답해라"가 아니라
 * **"무엇을 치고 있는지 슬쩍 보게"** 하는 유인이 된다. 게임이 아니라 감시를 만드는 장치다.
 * 그래서 현장의 눈(사회자)이 판단하고, 앱은 그 결과를 안전하게 수렴시킨다.
 *
 * ## 왜 `submitLiarGuess` 와 같은 모양인가
 *
 * 라이어가 답을 전송하는 순간과 사회자가 기권을 누르는 순간은 실제로 겹친다. 둘 중 **먼저 잠금을
 * 잡은 쪽이 그대로 판을 끝내고**, 나중에 도착한 쪽은 단계 검사에 걸려 조용히 무효가 된다.
 * 그래서 기권이 `liarGuess` 를 **지우지 않는다** — 라이어가 이미 낸 답이 있으면 그 결과가 먼저다.
 *
 * 권한은 판을 연 사람과 팀장(`activeRound(me, true)`). 라이어가 스스로 기권할 수는 없다 —
 * 자기 승패를 스스로 정하게 두면 판이 아니라 협상이다.
 */
export async function forfeitLiarGuess(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id } });
    if (!fresh || fresh.endedAt) return "이미 끝난 판입니다.";

    const game = fresh.game as IceGameKey;
    if (!canForfeitLiarGuess(game, icePhase(game, fresh.phase))) {
      // 라이어가 이미 답을 냈다면 그 결과가 먼저다 — 기권이 덮어쓰지 않는다.
      return fresh.liarGuess !== null ? "이미 라이어가 답을 냈습니다." : "지금은 기권 처리할 수 없습니다.";
    }

    await tx.iceRound.update({
      where: { id: fresh.id },
      data: {
        phase: "revealed",
        winner: "citizen",
        resultCode: ICE_RESULT_CODES.liarForfeit,
        // `guessCorrect` 는 두지 않는다 — 라이어가 추측을 하지 않았으므로 "틀렸다" 가 아니다.
        phaseStartedAt: new Date(),
      },
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 밤 행동 한 건을 받는다 — 마피아가 제거할 사람, 의사가 보호할 사람, 경찰이 조사할 사람.
 *
 * **전송한 것은 이 사람에게만 보인다.** 마피아끼리의 합의도 여기서 드러난다 — 서로 다른 사람을
 * 고르면 밤이 풀리지 않는다(`resolveNight` 의 `disagree`) — 그래서 마피아가 먼저 서로 맞춰야 한다.
 *
 * 다시 고르면 **한 줄이 바뀐다**(키가 `roundId · day · actorId · kind` 다). 밤에 결정을 바꿀 수
 * 있어야 하고, 두 줄이 쌓이면 "몇 명이 골랐나" 를 셀 수 없다.
 *
 * 한 번 보내면 **그 밤에 바꿀 수 없다.** 밤이 풀렸는데 자기 표가 나중에 지워지면, 그 밤의 판정이
 * 이 사람의 선택을 근거로 한 일이 아니게 된다.
 */
export async function submitIceNightAction(kind: NightActionKind, targetId: string): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, false);
  if (!round) return done(me, message);
  if (round.game !== "mafia") return done(me, "마피아에서만 쓰는 기능입니다.");
  if (round.phase !== "night") return done(me, "지금은 밤이 아닙니다.");

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.endedAt) return "이미 끝난 판입니다.";
    if (fresh.phase !== "night") return "지금은 밤이 아닙니다.";

    const mine = fresh.seats.find((s) => s.memberId === me.id);
    if (!mine) return "판에 앉아 있어야 밤 행동을 할 수 있습니다.";
    if (mine.outAt) return "탈락한 사람은 밤에 행동하지 않습니다.";
    // 이 역할이 할 수 있는 행동인지 — 시민이 폰으로 아무것이나 고르지 못하게 한다.
    if (nightRoleOf(mine.role as IceRole) !== kind) return "당신은 밤에 고를 수 있는 것이 아닙니다.";

    const target = fresh.seats.find((s) => s.memberId === targetId);
    if (!target) return "이 판에 없는 사람입니다.";
    if (!mayTargetAtNight(kind, me.id, target)) {
      if (target.memberId === me.id) return kind === "police_check" ? "자기 자신은 조사할 수 없습니다." : "자기 자신은 고를 수 없습니다.";
      return "이미 탈락한 사람입니다.";
    }

    // 밤이 이미 풀렸는데 표가 들어오면 안 된다 — 판정은 한 번뿐이다.
    if (nightAlreadyStruck(fresh.seats, fresh.phaseStartedAt)) return "오늘 밤은 이미 끝났습니다.";

    await tx.iceNightAction.upsert({
      where: { roundId_day_actorId_kind: { roundId: fresh.id, day: fresh.day, actorId: me.id, kind } },
      update: { targetId },
      create: { roundId: fresh.id, day: fresh.day, actorId: me.id, kind, targetId },
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 밤을 푼다 — 앱이 누가 빠졌는지 정하고 아침으로 넘긴다.
 *
 * 예전에는 사회자가 밤 결과를 손으로 적었다. 밤 행동이 앱에 모이므로 이제 **서버가 판정한다.**
 * 필요한 행동이 하나라도 모이면 풀지 않는다 — 모인 척 하고 아무도 안 죽은 밤으로 넘기면 의사가
 * 밤에 한 일을 조용히 버리는 셈이다.
 */
export async function resolveIceNight(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);
  if (round.game !== "mafia") return done(me, "마피아에서만 쓰는 기능입니다.");

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.endedAt) return "이미 끝난 판입니다.";
    if (fresh.phase !== "night") return "지금은 밤이 아닙니다.";
    if (nightAlreadyStruck(fresh.seats, fresh.phaseStartedAt)) return "오늘 밤은 이미 끝났습니다.";

    const acts = await tx.iceNightAction.findMany({
      where: { roundId: fresh.id, day: fresh.day },
      select: { actorId: true, kind: true, targetId: true },
    });
    const seats = fresh.seats.map((s) => ({ memberId: s.memberId, role: s.role as IceRole, outAt: s.outAt }));
    const resolution = resolveNight(
      acts.map((a) => ({ actorId: a.actorId, kind: a.kind as NightActionKind, targetId: a.targetId })),
      seats,
    );

    if (resolution.kind === "pending") {
      return `아직 ${resolution.missing}개의 밤 행동이 들어오지 않았습니다.`;
    }
    if (resolution.kind === "disagree") {
      return "마피아가 서로 다른 사람을 골랐습니다. 마피아끼리 맞춰 주세요.";
    }

    if (resolution.outId !== null) {
      // 빠진 사람에게 던진 표는 **지우지 않는다** — 그건 표의 기록이고, 집계는 그 회차의 후보
      // 안에서만 세므로 이미 이 자리로 세어지지 않는다(마이그레이션 20260930190000 의 사유).
      await tx.iceSeat.update({
        where: { roundId_memberId: { roundId: fresh.id, memberId: resolution.outId } },
        data: { outAt: new Date(), outHow: "night", outDay: fresh.day },
      });
      await clearBridgeVotes(tx, fresh.id, resolution.outId);
    }

    const code = resolution.outId
      ? mafiaOutcome(seats.filter((s) => s.outAt === null && s.memberId !== resolution.outId).map((s) => s.role))
      : null;
    await tx.iceRound.update({
      where: { id: fresh.id },
      data: code
        ? {
            phase: "revealed",
            resultCode: code,
            winner: code === ICE_RESULT_CODES.mafiaWin ? "mafia" : "citizen",
            phaseStartedAt: new Date(),
          }
        : { phase: "discussion", phaseStartedAt: new Date() },
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 밤을 마친다 — **아무도 빠지지 않은 밤.**
 *
 * 밤 행동(지목·치료·조사)은 앱이 받지 않고 사회자가 말로 진행한다 — 폰으로 받으면 단계와
 * 동기화가 몇 배로 늘고, 한자리에 모여 하는 게임의 재미도 줄어든다. 앱은 밤이 끝났다는 것과
 * 누가 빠졌는지만 안다.
 *
 * 밤에는 **한 명만** 빠진다. 두 번 빠진 밤이 되면 마피아가 한 밤에 두 번 죽이는 판이 되어,
 * 그것을 알아챌 사람은 아무도 없다.
 *
 * ## 이건 예외 길이다
 *
 * 밤 행동이 앱에 모이므로 정상 흐름은 [`resolveIceNight`](./resolveIceNight) 다. 여기서는 밤
 * 결과를 **직접 적는다** — 의사에게 못 물어본 밤, 마피아가 말로 정한 밤처럼 앱이 모르는 밤을
 * society가 대신 적어 준다. 같은 밤에 두 번 적을 수 없다는 보장은 그대로 남는다.
 */
export async function closeIceNight(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.game !== "mafia") return "마피아에서만 쓰는 기능입니다.";
    if (fresh.phase !== "night") return "지금은 밤이 아닙니다.";
    if (nightAlreadyStruck(fresh.seats, fresh.phaseStartedAt)) return "오늘 밤은 이미 누군가 빠졌습니다.";

    await tx.iceRound.update({
      where: { id: fresh.id },
      data: { phase: "discussion", phaseStartedAt: new Date() },
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 마피아의 밤 결과를 사회자가 **직접** 적는다.
 *
 * 한 번 적으면 그 밤은 끝나고 **토론으로 넘어간다** — 밤이 끝났다는 표시가 없어서 같은 밤에
 * 두 번 적는 일이 실제로 가능했다.
 *
 * 앱이 밤을 판정하지 못하는 밤을 위한 예외 길이다(정상 흐름은 `resolveIceNight`).
 */
export async function markIceNightOut(memberId: string): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);
  if (round.game !== "mafia") return done(me, "마피아에서만 쓰는 기능입니다.");

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.endedAt) return "이미 끝난 판입니다.";
    if (fresh.phase !== "night") return "지금은 밤이 아닙니다.";
    // 밤당 한 명. 같은 밤에 두 번 적히면 마피아가 두 번 죽인다.
    if (nightAlreadyStruck(fresh.seats, fresh.phaseStartedAt)) return "오늘 밤은 이미 누군가 빠졌습니다.";

    const target = fresh.seats.find((s) => s.memberId === memberId);
    if (!target || target.outAt) return "이미 탈락했거나 이 판에 없는 사람입니다.";

    await tx.iceSeat.update({
      where: { roundId_memberId: { roundId: fresh.id, memberId } },
      data: { outAt: new Date(), outHow: "night", outDay: fresh.day },
    });
    await clearBridgeVotes(tx, fresh.id, memberId);

    const code = mafiaOutcome(
      fresh.seats.filter((s) => s.outAt === null && s.memberId !== memberId).map((s) => s.role as IceRole),
    );
    await tx.iceRound.update({
      where: { id: fresh.id },
      data: code
        ? { phase: "revealed", resultCode: code, winner: code === ICE_RESULT_CODES.mafiaWin ? "mafia" : "citizen", phaseStartedAt: new Date() }
        : { phase: "discussion", phaseStartedAt: new Date() },
    });
    return undefined;
  });

  return done(me, note);
}

/**
 * 같은 사람들로 한 판 더.
 *
 * 예전에는 결과 → 판 끝내기 → 게임 고르기 → 라이어 고르기 → 시작, 네 번을 눌러야 다시
 * 시작했다. 아이스브레이킹은 같은 자리에서 두세 판을 하는데, 그 사이에 빠져나가는 순간이
 * 대부분이다. 여기선 한 번이다.
 */
export async function restartIceRound(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);
  if (round.phase !== "revealed") return done(me, "끝난 판만 다시 열 수 있습니다.");

  const seats = await db.iceSeat.findMany({ where: { roundId: round.id }, select: { memberId: true } });
  const ids = seats.map((s) => s.memberId);
  // 최소 인원은 게임마다 다르다(마피아는 5명). 3으로 박아 두면 마피아는 3명짜리 판을 열다.
  const spec = ICE_GAMES.find((g) => g.key === round.game);
  if (ids.length < (spec?.minPlayers ?? 3)) {
    return done(me, `같이 한 사람이 너무 적습니다. ${spec?.name ?? "이 게임"}은 ${spec?.minPlayers ?? 3}명부터입니다.`);
  }

  await db.iceRound.updateMany({
    where: { id: round.id, activeKey: me.teamId },
    data: { activeKey: null, endedAt: new Date() },
  });
  return startIceRound(round.game as IceGameKey, ids);
}

/** 판을 닫는다. 기록은 남기고 `activeKey` 만 비워 다음 판을 열 수 있게 한다. */
export async function endIceRound(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);

  await db.iceRound.updateMany({
    where: { id: round.id, activeKey: me.teamId },
    data: { activeKey: null, endedAt: new Date() },
  });
  return done(me);
}