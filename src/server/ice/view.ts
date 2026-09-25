import "server-only";

import type { IceGameKey, IceRole, IceView } from "@/lib/types";
import { db } from "@/server/db";
import type { SessionMember } from "@/server/session";
import { countVotes } from "./rules";

/**
 * 진행 중인 판을 **이 사람의 눈으로** 만든다.
 *
 * 남의 역할과 제시어는 결과를 공개하기 전에는 여기서 걸러져 아예 나가지 않는다.
 * 화면이 가리는 것에 기대면 개발자 도구로 볼 수 있다.
 */
export async function iceViewFor(me: SessionMember): Promise<IceView | null> {
  const round = await db.iceRound.findUnique({
    where: { activeKey: me.teamId },
    include: {
      host: { select: { name: true } },
      seats: { include: { member: { select: { name: true } } } },
    },
  });
  if (!round) return null;

  const seats = [...round.seats].sort((a, b) => a.member.name.localeCompare(b.member.name, "ko"));
  const nameOf = new Map(seats.map((s) => [s.memberId, s.member.name]));
  const mine = seats.find((s) => s.memberId === me.id) ?? null;
  const revealed = round.phase === "revealed";
  const alive = seats.filter((s) => s.outAt === null);

  const myRole = mine ? (mine.role as IceRole) : null;

  const tally = countVotes(seats.map((s) => s.voteForId)).tally;

  return {
    roundId: round.id,
    meId: me.id,
    game: round.game as IceGameKey,
    phase: revealed ? "revealed" : "play",
    hostName: round.host.name,
    canHost: round.hostId === me.id || me.isLeader,
    me:
      mine && myRole
        ? {
            role: myRole,
            alive: mine.outAt === null,
            voteForId: mine.voteForId,
            topic: round.topic,
            word: myRole === "liar" ? null : round.word,
            allies:
              myRole === "mafia"
                ? seats.filter((s) => s.role === "mafia" && s.memberId !== me.id).map((s) => s.member.name)
                : [],
          }
        : null,
    players: seats.map((s) => ({ id: s.memberId, name: s.member.name, alive: s.outAt === null })),
    votes: { cast: alive.filter((s) => s.voteForId !== null).length, total: alive.length },
    eliminated: seats
      .filter((s) => s.outAt !== null)
      .sort((a, b) => a.outAt!.getTime() - b.outAt!.getTime())
      .map((s) => ({ name: s.member.name, how: s.outHow === "night" ? "night" : "vote" })),
    result: revealed
      ? {
          roles: seats.map((s) => ({ name: s.member.name, role: s.role as IceRole })),
          word: round.word,
          tally: [...tally]
            .map(([id, votes]) => ({ name: nameOf.get(id) ?? "", votes }))
            .sort((a, b) => b.votes - a.votes),
          outcome: round.outcome ?? "",
        }
      : null,
  };
}
