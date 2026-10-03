import type { IceRole, NightActionKind } from "@/lib/types";

/**
 * 마피아의 역할 구성과 승패 — 순수 규칙.
 *
 * ## 왜 서버 밖, 액션 밖인가
 *
 * 서버가 역할을 나누기도 하고(`server/ice/rules.ts`) 화면이 "지금 6명이 모였으면 마피아가
 * 1명" 이라고 말하기도 한다. 두 곳에 표가 따로 있으면 어느 쪽이 틀렸는지 알 수 없고,
 * 어느 쪽도 고치지 않으면 조용히 어긋난다. 그래서 **한 파일을 같이 부른다** —
 * `scripts/smoke.mts` 도 이 파일을 그대로 불러 확인한다.
 *
 * `"use server"` 파일에 두면 export 하나하나가 서버 액션이 되고(`src/data/api.ts` 가
 * 목록을 만들 때 한 번 왕복), `server-only` 를 걸면 화면이 못 본다. 여기에는 DOM 도 DB 도
 * 없다.
 *
 * ## 왜 5명부터인가 (2026-09-30)
 *
 * 3~4명 판은 **밤 한 번과 낮 투표 한 번으로 거의 끝난다.** 마피아가 1명이면 시민이 1명만
 * 남는 순간(밤에 1명 죽거나, 첫 투표로 1명 빠지면) 곧바로 마피아 승리라 아이스브레이킹
 * Effect 보다 "운이 좋았다" 가 남는다. 그 인원에서는 라이어 게임이 훨씬 잘 맞는다.
 *
 * 인원표는 기획안에 없어 여기서 정했다(화면의 검토 표시와 함께 2026-09-30 확정).
 * 숫자만 고치면 되도록 한 곳에 모았다 — 한 줄을 바꾸면 화면 설명과 서버 배분이 함께 바뀐다.
 */
export const MAFIA_PRESETS: { players: number; roles: IceRole[] }[] = [
  { players: 5, roles: ["mafia", "police", "doctor", "citizen", "citizen"] },
  { players: 6, roles: ["mafia", "police", "doctor", "citizen", "citizen", "citizen"] },
  { players: 7, roles: ["mafia", "mafia", "police", "doctor", "citizen", "citizen", "citizen"] },
  { players: 8, roles: ["mafia", "mafia", "police", "doctor", "citizen", "citizen", "citizen", "citizen"] },
  { players: 9, roles: ["mafia", "mafia", "police", "doctor", "citizen", "citizen", "citizen", "citizen", "citizen"] },
  { players: 10, roles: ["mafia", "mafia", "mafia", "police", "doctor", "citizen", "citizen", "citizen", "citizen", "citizen"] },
];

/** 마피아 판의 최소 인원. 프리셋의 첫 줄이 이 값을 정한다 — 둘이 어긋나면 안 된다. */
export const MAFIA_MIN_PLAYERS = MAFIA_PRESETS[0].players;

/**
 * 마피아 판의 최대 인원. 프리셋의 마지막 줄이 이 값을 정한다.
 *
 * **프리셋을 무한히 늘리지 않는다.** 10명을 넘어서면 시민만 늘어나므로 12명 판도 15명 판도
 * 마피아 3명이다 — 밤 하나가 3초 만에 끝나고 15명이 같은 방에서 밤을 20번 견디는 판이 된다.
 * 아이스브레이킹이 아니라 판이 된다. 인원이 더 필요한 팀은 **두 판**을 한다.
 */
export const MAFIA_MAX_PLAYERS = MAFIA_PRESETS[MAFIA_PRESETS.length - 1].players;

/**
 * 인원수에 맞는 역할 목록. **표에 없는 인원이면 없다(null).**
 *
 * 예전에는 표를 넘어선 인원을 "큰 프리셋 + 시민 추가" 로 채웠다. 그래서 12명 판도 15명 판도
 * **마피아 3명**이었다 — 밤 하나가 몇 초 만에 끝나고, 15명이 같은 방에서 밤을 스무 번 견디는 판이
 * 된다. 인원이 늘면 배분이 조용히 달라져 아무도 모르게 다른 판이 열린다.
 *
 * 그래서 인원은 표 안에 있는 구간만 존재한다. 더 많은 사람이 함께 하고 싶으면 두 판을 한다.
 */
export function mafiaLineup(players: number): IceRole[] | null {
  if (players < MAFIA_MIN_PLAYERS || players > MAFIA_MAX_PLAYERS) return null;
  return MAFIA_PRESETS.find((p) => p.players === players)?.roles ?? null;
}

/** 인원수가 아니라, **실제로 앉은 역할들**로 이 판에 마피아가 몇 명인지 센다. */
export function countRoles(roles: IceRole[]): Record<IceRole, number> {
  const counts: Record<IceRole, number> = { liar: 0, citizen: 0, mafia: 0, police: 0, doctor: 0 };
  for (const role of roles) counts[role] += 1;
  return counts;
}

/** 화면이 "마피아 2 · 경찰 1 · 의사 1 · 시민 3" 이라고 말할 수 있게. */
export function mafiaLineupText(players: number): string {
  const lineup = mafiaLineup(players);
  // 인원이 표 밖이면 "몇 명까지 하는지" 를 말한다 — 역할 구성을 지어내지 않는다.
  if (!lineup) {
    return players < MAFIA_MIN_PLAYERS ? `${MAFIA_MIN_PLAYERS}명부터` : `${MAFIA_MAX_PLAYERS}명까지`;
  }
  const { mafia, police, doctor, citizen } = countRoles(lineup);
  return `마피아 ${mafia} · 경찰 ${police} · 의사 ${doctor} · 시민 ${citizen}`;
}

/**
 * 마피아 판이 지나는 단계. 밤 → 토론 → 투표 → (다음 밤 | 결과).
 *
 * 예전에는 `play` 하나가 밤과 낮을 함께 뜻했다. 그래서 ① 밤이 언제 끝났는지 아무도 몰랐고
 * ② 밤에 투표 버튼이 켜져 있었고 ③ **밤에 두 사람이 빠지는 일이 막히지 않았다.**
 * 밤 행동은 말로 하지만 "이 밤에 누가 빠졌나"는 앱이 지켜야 하는 값이다.
 */
export const MAFIA_PHASES = ["night", "discussion", "voting"] as const;
export type MafiaPhase = (typeof MAFIA_PHASES)[number];

/**
 * 이 단계에서 **어디로 갈 수 있는가.**
 *
 * `revealed` 는 어디서든 갈 수 있다 — 이기는 조건이 어느 단계에서든 성립하기 때문이다.
 * 반대로 `discussion` 에서 곧바로 `night` 으로 갈 수는 없다(낮을 건너뛰면 밤이 이어진다).
 *
 * 동점이면 `voting` → `discussion` 이고, 이기면 `voting` → `revealed`,
 * 끝나지 않으면 `voting` → `night`(밤이 하나 더 지난다)이다.
 */
export const MAFIA_NEXT: Record<MafiaPhase, (MafiaPhase | "revealed")[]> = {
  night: ["discussion", "revealed"],
  discussion: ["voting", "revealed"],
  voting: ["night", "discussion", "revealed"],
};

/** 이 단계에서 다음 단계로 넘어갈 수 있는가. */
export function canEnterMafiaPhase(from: MafiaPhase | "revealed", to: MafiaPhase | "revealed"): boolean {
  if (from === "revealed") return to === "revealed";
  if (to === "revealed") return true;
  return MAFIA_NEXT[from].includes(to);
}

/**
 * **이 밤에 이미 누군가 빠졌나.** 밤에는 한 명만 빠진다.
 *
 * 예전에는 밤 행동이 말로 진행되기 때문에 "밤이 끝났다"는 표시가 없었다. 사회자가 두 번 눌러
 * 두 사람이 빠졌는데 아무도 모르는 일이 실제로 가능했다. 지금은 밤에 빠진 사람이 있으면 그
 * 밤은 이미 끝난 밤이다 — 다시 누를 수 없다.
 *
 * `nightStartedAt` 은 이 단계가 시작된 시각이다. 예전에(다른 밤에) 빠진 사람은 세지 않는다.
 */
export function nightAlreadyStruck(
  seats: { outAt: Date | null; outHow: string | null }[],
  nightStartedAt: Date,
): boolean {
  return seats.some((s) => s.outHow === "night" && s.outAt !== null && s.outAt >= nightStartedAt);
}

/**
 * 밤에 할 수 있는 행동.
 *
 * 밤 행동은 예전에도 말로 했다(지목·치료·조회가 손짓으로 오간다). 하지만 **누가 누구를 골랐는지
 * 를 앱이 모르는 것과, 그걸 몰라도 되게 하는 것은 다르다.** 밤이 끝났다는 표시도, 밤에 한 명만
 * 빠진다는 보장도 없었고, 그래서 밤에 두 사람이 빠지는 일이 막히지 않았다.
 *
 * 종류 이름은 [`types.ts`](@/lib/types) 가 갖고 판정은 여기에 있다.
 */

/** 이 역할이 밤에 할 수 있는 행동. 시민은 없다. */
export function nightRoleOf(role: IceRole): NightActionKind | null {
  if (role === "mafia") return "mafia_kill";
  if (role === "doctor") return "doctor_save";
  if (role === "police") return "police_check";
  return null;
}

/** 이 행동의 자기 자신에게 대한 뜻 — 라이어 게임이 아니라 마피아 판에서만 쓴다. */
export const NIGHT_ACTION_LABEL: Record<NightActionKind, string> = {
  mafia_kill: "밤에 제거할 사람",
  doctor_save: "밤에 보호할 사람",
  police_check: "밤에 조사할 사람",
};

/** 밤 행동 한 건. 대상은 **한 명**이다. */
export type NightAction = { actorId: string; kind: NightActionKind; targetId: string };

/**
 * 이 밤에 **누가 무엇을 해야 하는가.** 죽은 사람은 밤 행동이 없다.
 *
 * 이 목록이 모이기 전에는 밤을 풀지 않는다 — 필요한데 안 온 행동이 있으면 "아무도 안 죽었다" 와
 * "의사가 아직 선택하지 않았다" 를 구별할 수 없고, 조용히 넘어가면 의사가 있는 밤이 사라진다.
 */
export function requiredNightActions(seats: { memberId: string; role: IceRole; outAt: Date | null }[]): {
  kind: NightActionKind;
  memberId: string;
}[] {
  return seats
    .filter((s) => s.outAt === null)
    .map((s) => ({ kind: nightRoleOf(s.role), memberId: s.memberId }))
    .filter((r): r is { kind: NightActionKind; memberId: string } => r.kind !== null);
}

/** 이 행동이 이 대상을 고를 수 있는가. */
export function mayTargetAtNight(
  kind: NightActionKind,
  actorId: string,
  target: { memberId: string; outAt: Date | null },
): boolean {
  // 이미 빠진 사람은 다시 고를 수 없다 — 밤 행동의 대상은 살아 있는 자리다.
  if (target.outAt !== null) return false;
  // 경찰이 자기 자신을 조사하면 "마피아다" 를 배운다. 아무것도 조사하지 못한 것과 같다.
  if (kind === "police_check" && target.memberId === actorId) return false;
  // 마피아가 자기 자신을 지목하면 밤에 아무도 죽지 않는다 — 아무도 그 사실을 알 수 없다.
  if (kind === "mafia_kill" && target.memberId === actorId) return false;
  // **의사는 자기 자신을 보호할 수 있다** — 처음 밤에 가장 많이 하는 선택이다.
  return true;
}

export type NightResolution =
  /** 필요한 행동이 아직 모이지 않았다. */
  | { kind: "pending"; missing: number }
  /** 마피아가 서로 다른 사람을 골랐다. 누구를 지목할지는 말로 정해야 한다. */
  | { kind: "disagree" }
  /** 밤이 풀렸다. `outId` 가 null 이면 아무도 빠지지 않았다. */
  | { kind: "resolved"; outId: string | null; savedId: string | null };

/**
 * 밤을 판정한다 — **한 곳에서만.**
 *
 * 순서: 마피아가 지목 → 의사가 보호 → 빠질 사람이 나온다. 몇 개 규칙이 여기 있다.
 *
 * - 마피아가 **여러 명이면 한 사람이어야 한다.** 서로 다르면 아무도 안 죽인 채로 끝나지 않는다 —
 *   밤이 풀리지 않았다는 사실을 사회자가 알아야 하기 때문에 `disagree` 를 돌려준다.
 * - 의사가 지목한 사람이 마피아가 지목한 사람이면 **아무도 빠지지 않는다.**
 * - 의사는 죽었어도 밤 행동이 없다 — 어제 살린 사람이 오늘 죽은 자리다.
 */
export function resolveNight(actions: NightAction[], seats: { memberId: string; role: IceRole; outAt: Date | null }[]): NightResolution {
  const required = requiredNightActions(seats);
  const have = new Set(actions.map((a) => `${a.kind}:${a.actorId}`));
  const missing = required.filter((r) => !have.has(`${r.kind}:${r.memberId}`)).length;
  if (missing > 0) return { kind: "pending", missing };

  const aliveMafia = new Set(
    seats.filter((s) => s.outAt === null && s.role === "mafia").map((s) => s.memberId),
  );
  const targets = new Set(
    actions
      .filter((a) => a.kind === "mafia_kill" && aliveMafia.has(a.actorId))
      .map((a) => a.targetId),
  );
  if (targets.size > 1) return { kind: "disagree" };

  const saved = actions.find((a) => a.kind === "doctor_save")?.targetId ?? null;
  const [killed] = targets;
  if (killed === undefined) return { kind: "resolved", outId: null, savedId: saved };
  if (killed === saved) return { kind: "resolved", outId: null, savedId: saved };
  return { kind: "resolved", outId: killed, savedId: saved };
}

/**
 * 낮 투표의 결론.
 *
 * - `eliminated` — 한 사람이 가장 많이 받았다. 그 사람이 빠진다.
 * - `runoff` — 동점이다. **동점자끼리만** 다시 투표한다(결선).
 * - `noVote` — 표가 하나도 없다(아무도 투표하지 않았거나, 고를 수 있는 대상이 아니었다).
 * - `stuck` — 결선을 해도 동점이다. 아무도 빠지지 않는다.
 */
export type DayVoteOutcome =
  | { kind: "eliminated"; targetId: string }
  | { kind: "runoff"; candidates: string[] }
  | { kind: "noVote" }
  | { kind: "stuck" };

/**
 * 한 번의 투표에서 결선을 몇 번까지 허용하는가.
 *
 * 결선이 무한정 좁아질 수는 없다 — 두 명이 계속 동점이면 몇 번을 반복해도 결과가 없다. 그래서
 * **한도를 넘기면 아무도 빠지지 않는다.** 동점으로 판을 끝내는 것은 한 사람이 운으로 사라지는 것보다
 * 낫다.
 *
 * ⚠️ **투표 회차로 재지 않는다.** 회차는 밤이 지날 때도 올라가므로, 회차로 재면 하루에 세 번
 * 결선한 판이 **다음 날 아침 첫 투표에서** 한도가 차 버린다. 이번 투표에서의 결선 횟수로 잰다.
 */
export const MAX_RUNOFFS = 2;

/**
 * 낮 투표의 결론을 낸다 — **한 곳에서만.**
 *
 * 예전에는 동점이면 **표 전체를 지웠다.** 그러면 같은 사람들이 같은 이야기를 다시 하고 같은 동점이
 * 되기를 반복했다. 지금은 결선으로 좁힌다 — 동점자 사이에서는 할 말이 생긴다.
 *
 * 결선이 무의미해지는 경우(동점자 집합이 후보 집합과 같다)는 `stuck` 이다. 후보를 좁히지 못한
 * 채로 "다시 투표"만 반복시키는 것이 아니라, **아무도 빠지지 않는다고 말해야** 끝이 난다.
 */
export function resolveDayVote(input: {
  ballots: { targetId: string | null }[];
  /** 지금 고를 수 있는 대상. 결선에서는 동점자만 들어 있다. */
  eligible: string[];
  /** 이번 투표에서 지금까지 결선을 몇 번 했는가. */
  runoffs: number;
}): DayVoteOutcome {
  const eligible = new Set(input.eligible);
  const tally = new Map<string, number>();
  for (const b of input.ballots) if (b.targetId && eligible.has(b.targetId)) tally.set(b.targetId, (tally.get(b.targetId) ?? 0) + 1);

  if (tally.size === 0) return { kind: "noVote" };

  let best = 0;
  for (const n of tally.values()) best = Math.max(best, n);
  const tied = [...tally].filter(([, n]) => n === best).map(([id]) => id);

  if (tied.length === 1) return { kind: "eliminated", targetId: tied[0] };
  // 후보를 좁히지 못하면 결선이 아니다 — 무한 반복 대신 부전.
  if (tied.length < eligible.size && input.runoffs < MAX_RUNOFFS) return { kind: "runoff", candidates: tied };
  return { kind: "stuck" };
}

/**
 * 이 판이 지나온 길 한 줄 — **결과 공개 뒤에만** 만든다.
 *
 * 여기서 id 를 이름으로 바꾸지 않는다. 이름 매핑은 화면이 하고, 판정은 id 만 다룬다 — 이름이
 * 같을 수 있기 때문이다(`types.ts` 의 역할 추첨과 같은 이유).
 */
export type TimelineEvent = {
  /** 몇 번째 밤/낮인지. 되살릴 수 없어 모르는 자리는 null. */
  day: number | null;
  how: "night" | "vote";
  /** 이 자리에서 누가 빠졌는지. 아무도 빠지지 않았으면 null. */
  outId: string | null;
  /** 밤에만 — 마피아가 지목한 사람. 지목 기록이 없으면 null. */
  killId: string | null;
  /** 밤에만 — 의사가 보호하려던 사람. 보호 기록이 없으면 null. */
  savedId: string | null;
  /** 투표에만 — 누가 누구에게 표를 던졌는지. */
  cast: { from: string; to: string }[];
  /** 투표에만 — 결선 투표였는지. */
  runoff: boolean;
};

/**
 * 결과 화면의 타임라인을 만든다 — **기록에서만.** 새 값을 만들어내지 않는다.
 *
 * 밤과 낮을 합쳐 "몇 일차에 누가 어떻게 빠졌는가" 한 줄로 읽히게 한다. 예전에는 결과가 "시민
 * 승리입니다" 와 역할 공개뿐이어서, 판이 왜 그렇게 끝났는지 아무도 다시 볼 수 없었다.
 *
 * ## 어디까지 기록이 남는가
 *
 * - **밤** — 지목과 보호 기록이 남는다. 아무도 안 죽은 밤도 줄로 남는다(지목·보호가 있었다는
 *   사실로 증명되므로).
 * - **낮 투표** — 표가 남는다. 누가 누구에게 던졌는지까지.
 * - 밤 행동도 표도 없이 진행된 밤(사회자가 직접 적은 예외 길)은 기록이 없어 **줄이 없다.**
 *   지어낼 수 없으므로 비운다.
 */
export function mafiaTimeline(input: {
  seats: { memberId: string; outDay: number | null; outHow: string | null }[];
  ballots: { seq: number; day: number; memberId: string; targetId: string; runoff: boolean }[];
  nightActs: { day: number; kind: string; targetId: string }[];
}): TimelineEvent[] {
  const nights = new Map<number, { killId: string | null; savedId: string | null }>();
  const nightOf = (day: number) => {
    const hit = nights.get(day);
    if (hit) return hit;
    const made = { killId: null as string | null, savedId: null as string | null };
    nights.set(day, made);
    return made;
  };

  for (const a of input.nightActs) {
    if (a.kind === "mafia_kill") nightOf(a.day).killId = a.targetId;
    if (a.kind === "doctor_save") nightOf(a.day).savedId = a.targetId;
  }
  // 지목 기록이 없는 밤(예외 길으로 직접 적은 밤)도 줄을 만들어야 빠진 사람이 드러난다.
  for (const s of input.seats) {
    if (s.outHow === "night" && s.outDay !== null) nightOf(s.outDay);
  }

  const votes = new Map<string, { day: number; seq: number; runoff: boolean; cast: { from: string; to: string }[] }>();
  for (const b of input.ballots) {
    const key = `${b.day}:${b.seq}`;
    const made = votes.get(key) ?? { day: b.day, seq: b.seq, runoff: b.runoff, cast: [] };
    made.runoff = made.runoff || b.runoff;
    made.cast.push({ from: b.memberId, to: b.targetId });
    votes.set(key, made);
  }

  const outOn = (day: number | null, how: "night" | "vote") =>
    input.seats.find((s) => s.outHow === how && s.outDay === day)?.memberId ?? null;

  const events: TimelineEvent[] = [];
  for (const [day, night] of nights) {
    const kill = night.killId;
    events.push({
      day,
      how: "night",
      outId: outOn(day, "night"),
      killId: kill,
      savedId: night.savedId,
      cast: [],
      runoff: false,
    });
  }
  for (const vote of votes.values()) {
    events.push({
      day: vote.day,
      how: "vote",
      outId: outOn(vote.day, "vote"),
      killId: null,
      savedId: null,
      cast: vote.cast,
      runoff: vote.runoff,
    });
  }

  // 밤 → 낮 순서, 같은 종류 안에는 날짜순.
  events.sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || (a.how === b.how ? a.day! - b.day! : a.how === "night" ? -1 : 1));
  return events;
}

/**
 * 살아 있는 자리로 **누가 이겼는지.** 아직 끝나지 않았으면 null.
 *
 * 승패 **코드**(`ICE_RESULT_CODES`)는 [`server/ice/rules.ts`](@/server/ice/rules) 가 만든다 —
 * 그 모듈이 코드를 소유한다. 여기서는 승리한 쪽만 말하고 문장도 코드도 만들지 않는다.
 * `catalog.ts` 가 이 모듈을 불러 화면 설명을 만들기 때문에, `server-only` 를 걸 수 없다.
 */
export type MafiaSide = "citizen" | "mafia";

export function mafiaWinner(aliveRoles: IceRole[]): MafiaSide | null {
  const mafia = aliveRoles.filter((r) => r === "mafia").length;
  if (mafia === 0) return "citizen";
  if (mafia >= aliveRoles.length - mafia) return "mafia";
  return null;
}
