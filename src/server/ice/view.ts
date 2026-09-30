import "server-only";

import type { IceGameKey, IcePhase, IceRole, IceView } from "@/lib/types";
import { db } from "@/server/db";
import type { SessionMember } from "@/server/session";
import { countVotes, iceResultText, maySeeWord } from "./rules";

/**
 * 진행 중인 판을 **이 사람의 눈으로** 만든다.
 *
 * 남의 역할과 제시어는 결과를 공개하기 전에는 여기서 걸러져 아예 나가지 않는다.
 * 화면이 가리는 것에 기대면 개발자 도구로 볼 수 있다.
 */

/**
 * 예전 판의 단계를 지금의 단계로 읽는다.
 *
 * 라이어 판은 예전에 `play` 하나가 "카드 확인 + 투표"를 함께 뜻했다. 마이그레이션이 그 값을
 * 고치면 **진행 중인 판의 단계가 앞당겨져** 카드를 보기 전에 투표가 열리거나, 반대로 투표가
 * 닫힌다. 그래서 DB 값은 그대로 두고 읽을 때만 해석한다.
 */
export function icePhase(game: IceGameKey, phase: string): IcePhase {
  if (phase === "clue" || phase === "vote" || phase === "liar_guess" || phase === "revealed") return phase;
  // 예전 라이어 판의 `play` 는 투표가 열린 상태였다.
  return game === "liar" ? "vote" : "play";
}

/**
 * 이 사람에게 **제시어를 내보내도 되는가.**
 *
 * 판정은 [`maySeeWord`](./rules) 한 곳에 있다 — 여기서 조건을 다시 쓰지 않는다. 두 곳에 쓰면
 * 한쪽만 고쳐져 라이어에게 제시어가 나가고, 어느 쪽이 맞는지는 아무도 모른다.
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
  const phase = icePhase(round.game as IceGameKey, round.phase);
  const revealed = phase === "revealed";
  const alive = seats.filter((s) => s.outAt === null);

  const myRole = mine ? (mine.role as IceRole) : null;

  const tally = countVotes(seats.map((s) => s.voteForId)).tally;

  // 설명 순서. 순서가 없는 자리는 뒤로 미룬다 — 마피아 판은 전부 null 이라 빈 배열이 된다.
  const turn = [...seats]
    .filter((s) => s.turnOrder !== null)
    .sort((a, b) => a.turnOrder! - b.turnOrder!)
    .map((s) => ({ id: s.memberId, name: s.member.name }));

  return {
    roundId: round.id,
    meId: me.id,
    game: round.game as IceGameKey,
    phase,
    hostName: round.host.name,
    canHost: round.hostId === me.id || me.isLeader,
    me:
      mine && myRole
        ? {
            role: myRole,
            alive: mine.outAt === null,
            voteForId: mine.voteForId,
            topic: round.topic,
            word: maySeeWord(myRole, phase) ? round.word : null,
            guessSubmitted: round.liarGuess !== null,
            allies:
              myRole === "mafia"
                ? seats.filter((s) => s.role === "mafia" && s.memberId !== me.id).map((s) => s.member.name)
                : [],
          }
        : null,
    players: seats.map((s) => ({ id: s.memberId, name: s.member.name, alive: s.outAt === null })),
    turn,
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
          // 새 판은 `resultCode` 로 말한다. 예전 판은 저장돼 있던 문장을 그대로 쓴다.
          outcome: iceResultText(round.resultCode) || round.outcome || "",
          guess: round.liarGuess !== null ? { text: round.liarGuess, correct: round.guessCorrect === true } : null,
        }
      : null,
  };
}