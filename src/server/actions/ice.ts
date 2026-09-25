"use server";

import { ICE_GAMES } from "@/data/catalog";
import type { IceGameKey, IceRole, IceView } from "@/lib/types";
import { db } from "@/server/db";
import { countVotes, deal, liarOutcome, mafiaOutcome } from "@/server/ice/rules";
import { iceViewFor } from "@/server/ice/view";
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

export async function startIceRound(game: IceGameKey): Promise<IceResult> {
  const me = await requireSessionMember();

  const spec = ICE_GAMES.find((g) => g.key === game);
  if (!spec?.playable) return done(me, "아직 열 수 없는 게임입니다.");

  const members = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null },
    select: { id: true },
  });
  if (members.length < spec.minPlayers) {
    return done(me, `${spec.name} 판은 ${spec.minPlayers}명부터 열 수 있습니다. 지금 팀은 ${members.length}명입니다.`);
  }

  const { roles, topic, word } = deal(game, members.map((m) => m.id));

  try {
    await db.iceRound.create({
      data: {
        teamId: me.teamId,
        activeKey: me.teamId,
        game,
        topic,
        word,
        hostId: me.id,
        seats: { create: [...roles].map(([memberId, role]) => ({ memberId, role })) },
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
    to: members.map((m) => m.id),
    kind: "icebreak",
    title: `${me.name}님이 ${spec.name} 판을 열었습니다`,
    body: "내 카드를 확인하세요. 다른 사람에게 보여 주지 마세요.",
    href: "/team/icebreak",
    actorId: me.id,
  });

  return done(me);
}

/** 투표. 같은 사람을 다시 누르면 취소된다. 공개·마감 전까지는 바꿀 수 있다. */
export async function castIceVote(targetId: string): Promise<IceResult> {
  const me = await requireSessionMember();
  const { round, message } = await activeRound(me, false);
  if (!round) return done(me, message);
  if (round.phase !== "play") return done(me, "이미 결과가 공개됐습니다.");

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
 * 라이어: 표를 세고 결과를 공개한다.
 * 마피아: 낮 투표를 마감한다 — 가장 많이 받은 한 사람이 탈락하고, 끝나지 않았으면 표를 비운다.
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
    if (!fresh || fresh.phase !== "play" || fresh.endedAt) return "이미 결과가 공개됐습니다.";

    const alive = fresh.seats.filter((s) => s.outAt === null);
    const { top } = countVotes(alive.map((s) => s.voteForId));

    if (fresh.game === "liar") {
      const caught = top !== null && fresh.seats.find((s) => s.memberId === top)?.role === "liar";
      await tx.iceRound.update({
        where: { id: fresh.id },
        data: { phase: "revealed", outcome: liarOutcome(caught) },
      });
      return undefined;
    }

    if (top === null) {
      await tx.iceSeat.updateMany({ where: { roundId: fresh.id }, data: { voteForId: null } });
      return "동점이거나 표가 없어 아무도 탈락하지 않았습니다. 다시 이야기해 보세요.";
    }

    await tx.iceSeat.update({
      where: { roundId_memberId: { roundId: fresh.id, memberId: top } },
      data: { outAt: new Date(), outHow: "vote" },
    });
    const outcome = mafiaOutcome(alive.filter((s) => s.memberId !== top).map((s) => s.role as IceRole));
    if (outcome) {
      // 끝난 판은 마지막 투표를 그대로 남겨 결과 화면에 보여 준다.
      await tx.iceRound.update({ where: { id: fresh.id }, data: { phase: "revealed", outcome } });
      return undefined;
    }
    await tx.iceSeat.updateMany({ where: { roundId: fresh.id }, data: { voteForId: null } });
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
    if (!fresh || fresh.phase !== "play") return "이미 끝난 판입니다.";

    const target = fresh.seats.find((s) => s.memberId === memberId);
    if (!target || target.outAt) return "이미 탈락했거나 이 판에 없는 사람입니다.";

    await tx.iceSeat.update({
      where: { roundId_memberId: { roundId: fresh.id, memberId } },
      data: { outAt: new Date(), outHow: "night", voteForId: null },
    });
    // 빠진 사람에게 던져진 표는 무효다.
    await tx.iceSeat.updateMany({ where: { roundId: fresh.id, voteForId: memberId }, data: { voteForId: null } });

    const outcome = mafiaOutcome(
      fresh.seats.filter((s) => s.outAt === null && s.memberId !== memberId).map((s) => s.role as IceRole),
    );
    if (outcome) await tx.iceRound.update({ where: { id: fresh.id }, data: { phase: "revealed", outcome } });
    return undefined;
  });

  return done(me, note);
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
