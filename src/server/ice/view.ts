import "server-only";

import { mafiaTimeline, mayTargetAtNight, nightRoleOf, requiredNightActions } from "@/lib/mafia-rules";
import type { IceGameKey, IcePhase, IceRole, IceView, NightActionKind } from "@/lib/types";
import { db } from "@/server/db";
import type { SessionMember } from "@/server/session";
import { countVotes, iceResultText, maySeeWord } from "./rules";

type NightRow = { day: number; actorId: string; kind: string; targetId: string };

/** 밤 행동에서 필요한 열만 읽는다 — 화면에 나가는 값이 네 개뿐이다. */
const NIGHT_SELECT = { day: true, actorId: true, kind: true, targetId: true } as const;

/**
 * 밤 정보를 **이 사람의 눈으로** 만든다. 세 가지를 사람마다 다르게 준다.
 *
 * - **내 밤 행동** — 내가 무엇을 골랐는지. 남의 것은 절대 나가지 않는다.
 * - **아직 모이지 않은 행동 수** — **사회자에게만.** 시민에게 "1/2" 를 보여 주면 살아 있는
 *   마피아 수를, "의사 0/1" 을 보여 주면 의사가 아직 살아 있는지 말하게 된다. 밤이 어둡다는
 *   것은 "누가 밤 행동 능력인지도 모른다" 는 뜻이다.
 * - **경찰의 조사 결과** — 그 경찰에게만. 다른 사람의 화면에는 이 칸 자체가 없다.
 */
function nightViewFor(
  input: {
    day: number;
    hostId: string;
    phase: IcePhase;
    seats: { memberId: string; name: string; role: string; outAt: Date | null }[];
    /** 이 밤의 행동. */
    acts: NightRow[];
    /** 이 사람의 가장 최근 police_check — 밤이 지나도 기억해야 한다. */
    myCheck: NightRow | null;
  },
  meId: string,
): IceView["night"] {
  const mine = input.seats.find((s) => s.memberId === meId) ?? null;
  const role = mine ? (mine.role as IceRole) : null;
  const kind = role ? nightRoleOf(role) : null;
  const myAct = input.acts.find((a) => a.actorId === meId && a.kind === kind) ?? null;

  const checked = input.myCheck ? input.seats.find((s) => s.memberId === input.myCheck!.targetId) : null;

  const required = requiredNightActions(
    input.seats.map((s) => ({ memberId: s.memberId, role: s.role as IceRole, outAt: s.outAt })),
  );
  const have = new Set(input.acts.map((a) => `${a.kind}:${a.actorId}`));
  const missing = required.filter((r) => !have.has(`${r.kind}:${r.memberId}`)).length;

  return {
    day: input.day,
    /** 내가 밤에 고를 수 있는 것. 시민·관전자는 null — 밤에는 아무것도 하지 않는다. */
    mine: kind as NightActionKind | null,
    myTargetId: myAct?.targetId ?? null,
    /** 밤 단계이고 내가 살아 있을 때만 고를 수 있다. */
    open: input.phase === "night" && mine?.outAt === null,
    /** 고를 수 있는 사람은 **서버가 정한다** — 규칙을 두 곳에 쓰지 않는다. */
    canTarget:
      kind && input.phase === "night" && mine?.outAt === null
        ? input.seats.filter((s) => mayTargetAtNight(kind, meId, s)).map((s) => s.memberId)
        : [],
    /** 사회자가 아닌 사람에게는 숫자를 주지 않는다 — 위 주석의 이유. */
    waiting: input.hostId === meId ? missing : null,
    check:
      input.myCheck && checked
        ? { day: input.myCheck.day, name: checked.name, isMafia: checked.role === "mafia" }
        : null,
  };
}

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
 *
 * 예전 마피아 판의 `play` 는 "밤이랑 낮이 한 단계, 투표가 열려 있음"이었다. 지금은 밤과
 * 토론이 각각 단계이므로 **투표가 열려 있던 `voting` 으로 읽는다** — 고치면 갑자기 밤으로 넘어가
 * 아무도 투표할 수 없게 된다.
 */
export function icePhase(game: IceGameKey, phase: string): IcePhase {
  if (phase === "clue" || phase === "vote" || phase === "liar_guess" || phase === "revealed") return phase;
  if (phase === "night" || phase === "discussion" || phase === "voting") return phase;
  // 예전 `play` — 투표가 열려 있던 상태로 읽는다.
  return game === "liar" ? "vote" : "voting";
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

  const mafia = round.game === "mafia";
  const aliveIds = new Set(alive.map((s) => s.memberId));

  // 설명 순서. 순서가 없는 자리는 뒤로 미룬다 — 마피아 판은 전부 null 이라 빈 배열이 된다.
  const turn = [...seats]
    .filter((s) => s.turnOrder !== null)
    .sort((a, b) => a.turnOrder! - b.turnOrder!)
    .map((s) => ({ id: s.memberId, name: s.member.name }));

  // 밤 행동은 **마피아 판에서만** 읽는다 — 라이어 판의 3초 폴링마다 두 쿼리를 더 하지 않는다.
  const [acts, myCheck] = mafia
    ? await Promise.all([
        db.iceNightAction.findMany({ where: { roundId: round.id, day: round.day }, select: NIGHT_SELECT }),
        // 🕵️ 경찰은 지난 밤의 조회를 기억해야 한다 — 밤 번호를 몰라도 자기 것만 찾는다.
        myRole === "police"
          ? db.iceNightAction.findFirst({
              where: { roundId: round.id, actorId: me.id, kind: "police_check" },
              orderBy: { day: "desc" },
              select: NIGHT_SELECT,
            })
          : null,
      ])
    : [null, null];

  // 이번 투표 회차의 표만 읽는다 — 결선은 **같은 회차**에서 후보만 좁히므로 회차가 늘지 않는다.
  // 결과 화면도 마지막 회차의 표를 본다(`voteSeq` 는 마지막으로 열린 회차다).
  const ballots = await db.iceBallot.findMany({
    where: { roundId: round.id, seq: round.voteSeq },
    select: { memberId: true, targetId: true },
  });
  const myBallot = ballots.find((b) => b.memberId === me.id) ?? null;
  const tally = countVotes(ballots.map((b) => b.targetId)).tally;

  /**
   * **고를 수 있는 사람** — 서버가 정한다. 보통 투표는 "살아 있는 다른 사람 전부", 결선은
   * "동점자 중 자기 자신이 아닌 사람". 화면이 이 조건을 다시 쓰면 "결선인데 왜 저 사람이 보이지"
   * 처럼 어긋난다(밤의 선택 목록과 같은 이유로 한 곳에서 정한다).
   */
  const voteBase =
    round.eligibleTargets.length > 0 ? round.eligibleTargets.filter((id) => aliveIds.has(id)) : [...aliveIds];
  const canVoteFor = mine && mine.outAt === null ? voteBase.filter((id) => id !== me.id) : [];

  const night =
    mafia && acts
      ? nightViewFor(
          {
            day: round.day,
            hostId: round.hostId,
            phase,
            seats: seats.map((s) => ({ memberId: s.memberId, name: s.member.name, role: s.role, outAt: s.outAt })),
            acts,
            myCheck,
          },
          me.id,
        )
      : null;

  const timeline =
    revealed && mafia
      ? mafiaTimeline({
          seats: seats.map((x) => ({ memberId: x.memberId, outDay: x.outDay, outHow: x.outHow })),
          ballots: await db.iceBallot.findMany({
            where: { roundId: round.id },
            select: { seq: true, day: true, memberId: true, targetId: true, runoff: true },
          }),
          nightActs: await db.iceNightAction.findMany({
            where: { roundId: round.id },
            select: { day: true, kind: true, targetId: true },
          }),
        })
      : [];

  return {
    roundId: round.id,
    meId: me.id,
    game: round.game as IceGameKey,
    phase,
    day: round.day,
    hostName: round.host.name,
    canHost: round.hostId === me.id || me.isLeader,
    me:
      mine && myRole
        ? {
            role: myRole,
            alive: mine.outAt === null,
            voteForId: myBallot?.targetId ?? null,
            topic: round.topic,
            word: maySeeWord(myRole, phase) ? round.word : null,
            guessSubmitted: round.liarGuess !== null,
            allies:
              myRole === "mafia"
                ? seats.filter((s) => s.role === "mafia" && s.memberId !== me.id).map((s) => s.member.name)
                : [],
            /** 경찰의 조사 결과. **이 경찰에게만** 준다 — 남의 화면에는 이 칸이 없다. */
            check: night?.check ?? null,
          }
        : null,
    players: seats.map((s) => ({ id: s.memberId, name: s.member.name, alive: s.outAt === null })),
    night,
    turn,
    votes: {
      cast: ballots.length,
      total: alive.length,
      /** 이 판의 몇 번째 투표 회차인가. 결선이 줄지 않는다 — 같은 회차 안에서 좁아진다. */
      seq: round.voteSeq,
      /** 결선인가(후보가 좁혀졌는가). */
      runoff: round.eligibleTargets.length > 0,
      /** 지금 고를 수 있는 사람 id. */
      canVoteFor,
    },
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
          // 이 판이 지나온 길. id 를 이름으로 바꿔서 내보낸다 — 판정은 id 만 다룬다.
          timeline: timeline.map((e) => ({
            day: e.day,
            how: e.how,
            out: e.outId ? (nameOf.get(e.outId) ?? "") : null,
            kill: e.killId ? (nameOf.get(e.killId) ?? "") : null,
            saved: e.savedId ? (nameOf.get(e.savedId) ?? "") : null,
            cast: e.cast.map((c) => ({ from: nameOf.get(c.from) ?? "", to: nameOf.get(c.to) ?? "" })),
            runoff: e.runoff,
          })),
          guess: round.liarGuess !== null ? { text: round.liarGuess, correct: round.guessCorrect === true } : null,
        }
      : null,
  };
}