"use server";

import { randomInt } from "node:crypto";
import { ICE_GAMES } from "@/data/catalog";
import type { IceGameKey, IceRole, IceView } from "@/lib/types";
import { db } from "@/server/db";
import {
  ICE_RESULT_CODES,
  canVoteNow,
  checkLiarGuess,
  countVotes,
  deal,
  liarOf,
  mafiaOutcome,
  resolveLiarVote,
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
 * 참가자 명단을 **다시 확인한다.**
 *
 * 화면이 골라 온 id 를 그대로 믿으면 안 된다 — 한 팀원이 남의 팀 사람 id 를 넣어 다른 팀의
 * 판에 자리를 앉힐 수 있다. 그래서 같은 팀인지 · 팀을 나기지 않았는지 · 중복이 없는지 ·
 * 최소 인원인지를 서버에서 다시 본다.
 */
async function validParticipants(teamId: string, ids: string[], min: number): Promise<{ ids: string[] | null; message: string }> {
  const wanted = [...new Set(ids)];
  if (wanted.length !== ids.length) return { ids: null, message: "같은 사람이 두 번 들어 있습니다." };

  const found = await db.member.findMany({
    where: { id: { in: wanted }, teamId, leftAt: null },
    select: { id: true },
  });
  if (found.length !== wanted.length) return { ids: null, message: "같은 팀에 있는 사람만 넣을 수 있습니다." };
  if (wanted.length < min) return { ids: null, message: `${wanted.length}명으로는 진행할 수 없습니다.` };
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

  const picked = await validParticipants(me.teamId, participantIds, spec.minPlayers);
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
        phase: game === "liar" ? "clue" : "play",
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

/** 라이어: 카드 확인이 끝나면 투표를 연다. 마피아는 처음부터 투표가 열려 있다. */
export async function startIceVote(): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);
  if (round.game !== "liar") return done(me, "마피아는 처음부터 투표가 열려 있습니다.");
  if (round.phase !== "clue") return done(me, "이미 투표가 열려 있습니다.");

  await db.iceRound.updateMany({
    where: { id: round.id, activeKey: me.teamId, phase: "clue" },
    data: { phase: "vote", phaseStartedAt: new Date() },
  });
  return done(me, "이제 투표할 수 있습니다.");
}

/** 투표. 같은 사람을 다시 누르면 취소된다. 투표가 열린 동안에만 바꾼다. */
export async function castIceVote(targetId: string): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, false);
  if (!round) return done(me, message);
  // 예전 판(`play`)도 지금의 단계로 읽는다 — 배포 중이던 판이 투표할 수 없는 판이 되면 안 된다.
  const phase = icePhase(round.game as IceGameKey, round.phase);
  if (!canVoteNow(round.game as IceGameKey, phase)) {
    return done(me, round.game === "liar" && phase === "clue" ? "아직 투표가 열리지 않았습니다." : "이미 투표가 끝났습니다.");
  }

  const seats = await db.iceSeat.findMany({ where: { roundId: round.id } });
  const mine = seats.find((s) => s.memberId === me.id);
  const target = seats.find((s) => s.memberId === targetId);

  if (!mine) return done(me, "판이 시작된 뒤에 들어와 이번 판은 구경만 할 수 있습니다.");
  if (mine.outAt) return done(me, "탈락한 사람은 투표하지 않습니다.");
  if (!target || target.outAt || targetId === me.id) return done(me, "그 사람에게는 투표할 수 없습니다.");

  await db.iceSeat.update({
    where: { roundId_memberId: { roundId: round.id, memberId: me.id } },
    data: { voteForId: mine.voteForId === targetId ? null : targetId },
  });
  return done(me);
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

    if (game === "liar") {
      const outcome = resolveLiarVote(
        alive.map((s) => s.voteForId),
        fresh.seats.map((s) => ({ memberId: s.memberId, role: s.role })),
      );

      if (outcome.kind === "tie") {
        await tx.iceSeat.updateMany({ where: { roundId: fresh.id }, data: { voteForId: null } });
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

    const { top } = countVotes(alive.map((s) => s.voteForId));

    if (top === null) {
      await tx.iceSeat.updateMany({ where: { roundId: fresh.id }, data: { voteForId: null } });
      return "동점이거나 표가 없어 아무도 탈락하지 않았습니다. 다시 이야기해 보세요.";
    }

    await tx.iceSeat.update({
      where: { roundId_memberId: { roundId: fresh.id, memberId: top } },
      data: { outAt: new Date(), outHow: "vote" },
    });
    const code = mafiaOutcome(alive.filter((s) => s.memberId !== top).map((s) => s.role as IceRole));
    if (code) {
      // 끝난 판은 마지막 투표를 그대로 남겨 결과 화면에 보여 준다.
      await tx.iceRound.update({
        where: { id: fresh.id },
        data: {
          phase: "revealed",
          resultCode: code,
          winner: code === ICE_RESULT_CODES.mafiaWin ? "mafia" : "citizen",
          phaseStartedAt: new Date(),
        },
      });
      return undefined;
    }
    await tx.iceSeat.updateMany({ where: { roundId: fresh.id }, data: { voteForId: null } });
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
 * 마피아의 밤 결과를 사회자가 적는다.
 *
 * 밤 행동(지목·치료·조사)은 앱이 받지 않고 사회자가 말로 진행한다 — 폰으로 받으면 단계와
 * 동기화가 몇 배로 늘고, 한자리에 모여 하는 게임의 재미도 줄어든다. 앱은 누가 빠졌는지만 안다.
 */
export async function markIceNightOut(memberId: string): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, true);
  if (!round) return done(me, message);
  if (round.game !== "mafia") return done(me, "마피아에서만 쓰는 기능입니다.");

  const note = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IceRound" WHERE id = ${round.id} FOR UPDATE`;
    const fresh = await tx.iceRound.findUnique({ where: { id: round.id }, include: { seats: true } });
    if (!fresh || fresh.phase === "revealed") return "이미 끝난 판입니다.";

    const target = fresh.seats.find((s) => s.memberId === memberId);
    if (!target || target.outAt) return "이미 탈락했거나 이 판에 없는 사람입니다.";

    await tx.iceSeat.update({
      where: { roundId_memberId: { roundId: fresh.id, memberId } },
      data: { outAt: new Date(), outHow: "night", voteForId: null },
    });
    // 빠진 사람에게 던져진 표는 무효다.
    await tx.iceSeat.updateMany({ where: { roundId: fresh.id, voteForId: memberId }, data: { voteForId: null } });

    const code = mafiaOutcome(
      fresh.seats.filter((s) => s.outAt === null && s.memberId !== memberId).map((s) => s.role as IceRole),
    );
    if (code) {
      await tx.iceRound.update({
        where: { id: fresh.id },
        data: {
          phase: "revealed",
          resultCode: code,
          winner: code === ICE_RESULT_CODES.mafiaWin ? "mafia" : "citizen",
          phaseStartedAt: new Date(),
        },
      });
    }
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
  if (ids.length < 3) return done(me, "같이 한 사람이 너무 적습니다.");

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