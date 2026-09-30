import "server-only";

import { randomInt } from "node:crypto";
import { LIAR_PROMPTS } from "@/data/liar-prompts";
import type { IceGameKey, IceRole } from "@/lib/types";

/**
 * 28 아이스브레이킹의 규칙 — 누가 무엇을 받는지, 언제 끝나는지.
 *
 * 데이터베이스를 모르는 순수 함수만 둔다. 액션(`server/actions/ice.ts`)이 이걸 불러
 * 저장하고, 보는 사람마다 보여 줄 것을 거른다.
 *
 * 무작위는 `crypto.randomInt` 다. `Math.random` 은 다음 값을 짐작할 수 있어, 비밀을 나누는
 * 데 쓰기에는 약하다.
 */

/** 한 판이 지나가는 단계. DB의 `IceRound.phase` 에 그대로 저장한다. */
export const ICE_PHASES = ["clue", "vote", "liar_guess", "play", "revealed"] as const;
export type IcePhase = (typeof ICE_PHASES)[number];

/** 라이어 게임의 승리자. 마피아 판은 `null`(아직 안 끝남)이거나 citizen/mafia 다. */
export type IceWinner = "liar" | "citizen";

/**
 * **승패를 사실로 저장한다.** 문장을 저장하지 않는다.
 *
 * 예전에는 `outcome` 에 "라이어의 승리입니다" 같은 한국어 문장을 넣었다. 그러면 1) 같은
 * 사실을 문장으로 저장해야 하고 2) 문장을 고칠 수 없다 — 이미 쌓인 판의 결과도 옛말로
 * 남고, "열차역"처럼 말이 뒤늦게 바뀌어도 예전 판은 고쳐지지 않는다.
 * 코드로 저장하면 화면이 문장을 만든다.
 */
export const ICE_RESULT_CODES = {
  /** 라이어가 지목되지 않았다. */
  liarMissed: "LIAR_MISSED",
  /** 라이어가 지목됐고 제시어를 맞혔다. */
  liarGuessed: "LIAR_GUESSED_WORD",
  /** 라이어가 지목됐고 틀렸다. */
  liarCaught: "LIAR_CAUGHT_WRONG_GUESS",
  /** 시민이 지목됐다. */
  citizenAccused: "CITIZEN_ACCUSED",
  mafiaWin: "MAFIA_WIN",
  townWin: "TOWN_WIN",
} as const;
export type IceResultCode = (typeof ICE_RESULT_CODES)[keyof typeof ICE_RESULT_CODES];

/** 결과 코드 → 한국어. 화면이 문장을 만든다 — DB에는 코드만 남는다. */
export function iceResultText(code: string | null): string {
  switch (code) {
    case ICE_RESULT_CODES.liarMissed:
      return "라이어를 찾지 못했습니다. 라이어의 승리입니다.";
    case ICE_RESULT_CODES.liarGuessed:
      return "라이어가 제시어를 맞혔습니다. 라이어의 역전승입니다.";
    case ICE_RESULT_CODES.liarCaught:
      return "라이어가 제시어를 틀렸습니다. 시민의 승리입니다.";
    case ICE_RESULT_CODES.citizenAccused:
      return "시민이 지목됐습니다. 라이어의 승리입니다.";
    case ICE_RESULT_CODES.mafiaWin:
      return "마피아 수가 나머지와 같아졌습니다. 마피아 승리입니다.";
    case ICE_RESULT_CODES.townWin:
      return "마피아가 모두 탈락했습니다. 시민 승리입니다.";
    default:
      return "";
  }
}

/** 서로 다른 자리 k 개를 고른다(부분 피셔–예이츠). */
function pickIndexes(n: number, k: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(n - i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, k);
}

/**
 * 마피아 역할 구성.
 *
 * 인원별 구성은 기획안에 없어 흔히 쓰는 비율로 임시로 정했다(화면의 <Undecided>):
 * 3명은 마피아 1·의사 1, 4~5명은 마피아 1·경찰 1, 6명부터 마피아 2·경찰 1·의사 1. 나머지는 시민.
 *
 * 3명은 경찰을 빼고 의사를 둔다 — 이 인원에서는 밤에 한 명이라도 죽으면 마피아가 1대1이 되어
 * 곧장 승리한다. 그래서 밤에 의사만 살릴 수 있고, 살린 사람이 저녁 투표를 여는 수가 된다.
 */
export function mafiaLineup(players: number): IceRole[] {
  const special: IceRole[] =
    players >= 6 ? ["mafia", "mafia", "police", "doctor"] : players >= 4 ? ["mafia", "police"] : ["mafia", "doctor"];
  return [...special, ...Array<IceRole>(players - special.length).fill("citizen")];
}

/** 뺄 수 있는 사람. 직전 판의 라이어를 다음 판에서 빼기 위해 지난 판 기록을 받는다. */
export type LiarExclusions = {
  /** 최근에 나온 제시어. 같은 제시어가 바로 반복되지 않게 한다. */
  recentWords: string[];
  /** 직전 판의 라이어. 연달아 같은 사람이 라이어가 되는 것을 막는다. */
  previousLiarId: string | null;
};

/**
 * 제시어를 하나 고른다. **뺄 것이 남았으면 뺀다.**
 *
 * 같은 주제 안에서 가장 가까운 제시어부터 시도하지 않는다 — 뺄 목록이 273개를 덮으면 후보가
 * 없어지고, 그때는 뺀 목록을 무시한다. 겹치는 것보다 게임이 안 열리는 것이 나쁘다.
 */
function pickPrompt(exclude: LiarExclusions): { category: string; word: string; aliases: string[] } {
  const banned = new Set(exclude.recentWords);
  const pool = banned.size === 0 ? LIAR_PROMPTS : LIAR_PROMPTS.filter((p) => !banned.has(p.word));
  const usable = pool.length > 0 ? pool : LIAR_PROMPTS;
  const picked = usable[randomInt(usable.length)];
  return { category: picked.category, word: picked.word, aliases: picked.aliases ?? [] };
}

/** 자리마다 역할을 나눈다. 라이어 게임이면 주제·제시어도 함께 고른다. */
export function deal(
  game: IceGameKey,
  memberIds: string[],
  exclude: LiarExclusions = { recentWords: [], previousLiarId: null },
): { roles: Map<string, IceRole>; topic: string | null; word: string | null; aliases: string[] } {
  const roles = new Map<string, IceRole>(memberIds.map((id) => [id, "citizen"]));

  if (game === "liar") {
    // 직전 판의 라이어는 뺀다. 한 명뿐이면 어차피 그 사람이 라이어가 된다.
    const candidates = exclude.previousLiarId ? memberIds.filter((id) => id !== exclude.previousLiarId) : memberIds;
    const pool = candidates.length > 0 ? candidates : memberIds;
    const [liar] = pickIndexes(pool.length, 1);
    roles.set(pool[liar], "liar");
    const { category, word, aliases } = pickPrompt(exclude);
    return { roles, topic: category, word, aliases };
  }

  const lineup = mafiaLineup(memberIds.length);
  const seats = pickIndexes(memberIds.length, memberIds.length);
  seats.forEach((seat, i) => roles.set(memberIds[seat], lineup[i]));
  return { roles, topic: null, word: null, aliases: [] };
}

/** 누가 라이어였는지. 판이 끝난 뒤에만 쓴다. */
export function liarOf(seats: { memberId: string; role: string }[]): string | null {
  return seats.find((s) => s.role === "liar")?.memberId ?? null;
}

/**
 * 이 사람에게 **제시어를 내보내도 되는가.**
 *
 * 라이어 게임의 비밀은 이것 하나다. 판을 만드는 곳(`view.ts`)이 여기서 허용 여부를 묻고,
 * 답을 들은 것만 라이어에게 준다 — 한 곳을 정하지 않으면 어느 한 화면을 고치다 라이어에게
 * 제시어가 나간다.
 *
 * - 라이어: `revealed` 가 되기 전까지 **절대**. `liar_guess` 단계에서도 마찬가지다 —
 *   그 단계의 이름부터 정답을 알려 주는 단계이기 때문이다.
 * - 시민: 언제나 받는다. 라이어가 판 안에서 계속 설명해야 하는 이유가 이것이다.
 */
export function maySeeWord(role: IceRole, phase: IcePhase): boolean {
  return phase === "revealed" || role !== "liar";
}

/**
 * 표를 센다. 가장 많이 받은 사람이 **한 명일 때만** 뽑힌 것으로 본다 — 동점이면 아무도
 * 뽑히지 않는다(흔한 규칙이고, 동점자 중 하나를 무작위로 고르면 게임이 운으로 끝난다).
 */
export function countVotes(votes: (string | null)[]): {
  tally: Map<string, number>;
  top: string | null;
} {
  const tally = new Map<string, number>();
  for (const target of votes) if (target) tally.set(target, (tally.get(target) ?? 0) + 1);

  let top: string | null = null;
  let best = 0;
  let tied = false;
  for (const [id, n] of tally) {
    if (n > best) [top, best, tied] = [id, n, false];
    else if (n === best) tied = true;
  }
  return { tally, top: tied ? null : top };
}

/**
 * 라이어 판의 표를 정산한다.
 *
 * ## 왜 동점을 승패로 처리하지 않는가
 *
 * 예전에는 `caught = top !== null && ...` 였다. 그러면 **동점과 0표가 곧 라이어 승리**가
 * 됐다 — 표를 하나도 못 받은 상태에서 사회자가 실수로 "결과 공개"를 눌러도 라이어가 이겼다.
 * 마피아는 이 상황을 재투표로 처리하고 있었는데 라이어에만 빠져 있었다.
 *
 * 지금은 승부가 나지 않으면 판을 **그대로 두고** 동점이니 다시 투표하라고 한다.
 */
export type LiarVoteResolution =
  /** 동점 또는 표가 없음. 표를 비우고 다시 투표한다. 승자가 없다. */
  | { kind: "tie" }
  /** 라이어가 아닌 사람이 지목됐다. 라이어 승리, 곧바로 끝난다. */
  | { kind: "ended"; winner: IceWinner; code: IceResultCode; accusedId: string }
  /** 라이어가 지목됐다. **즉시 공개하지 않는다** — 라이어에게 마지막 추측을 준다. */
  | { kind: "liarGuess"; accusedId: string };

export function resolveLiarVote(votes: (string | null)[], seats: { memberId: string; role: string }[]): LiarVoteResolution {
  const { top } = countVotes(votes);
  // 동점이거나 아무도 투표하지 않았다. 승부가 나지 않았다.
  if (top === null) return { kind: "tie" };

  const accused = seats.find((s) => s.memberId === top);
  // 표가 이 판의 자리가 없는 사람을 가리키면(구경만 하게 들어온 사람 등) 승부를 만들지 않는다.
  if (!accused) return { kind: "tie" };

  if (accused.role === "liar") {
    // 라이어가 지목됐다. 여기서 `revealed` 로 가면 라이어의 마지막 기회가 사라진다.
    return { kind: "liarGuess", accusedId: accused.memberId };
  }
  return {
    kind: "ended",
    winner: "liar",
    code: ICE_RESULT_CODES.citizenAccused,
    accusedId: accused.memberId,
  };
}

/**
 * 라이어의 최종 추측을 판정한다.
 *
 * ## 정규화
 *
 * 사람이 폰으로 한 글자씩 친다 — 띄어쓰기를 빠뜨리고, 오타를 낸다. `떡볶이 ` 와 `떡보끼` 는
 * 같은 답이다. 공백을 없애고 소문자로 낮춘 뒤, 정답과 그 별칭을 모두 비교한다.
 *
 * **비교만 한다.** 누가 라이어였는지는 서버가 이미 알고 있고, 그 판정은 제출한 사람에게
 * 돌아가지 않는다 — 라이어가 화면에서 직접 제출하므로.
 */
export function checkLiarGuess(guess: string, word: string, aliases: string[] = []): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const g = norm(guess);
  if (!g) return false;
  return [word, ...aliases].some((w) => norm(w) === g);
}

/** 마피아가 끝났는지. 끝났으면 결과 코드, 아니면 null. */
export function mafiaOutcome(aliveRoles: IceRole[]): IceResultCode | null {
  const mafia = aliveRoles.filter((r) => r === "mafia").length;
  if (mafia === 0) return ICE_RESULT_CODES.townWin;
  if (mafia >= aliveRoles.length - mafia) return ICE_RESULT_CODES.mafiaWin;
  return null;
}

/**
 * 라이어 게임에서 이 사람이 투표할 수 있는지. 이 단계에서만 투표가 열린다.
 *
 * 예전에는 `phase === "play"` 였다 — 카드 확인과 투표가 한 단계여서 카드도 보자마자
 * 투표할 수 있었다. 지금은 투표가 **`vote` 에서만** 열리고, `clue` 에서는 않는다.
 */
export function canVoteNow(game: IceGameKey, phase: string): boolean {
  return game === "mafia" ? phase === "play" : phase === "vote";
}