import "server-only";

import { randomInt } from "node:crypto";
import { LIAR_TOPICS } from "@/data/catalog";
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
 * 4~5명은 마피아 1·경찰 1, 6명부터 마피아 2·경찰 1·의사 1. 나머지는 시민.
 */
export function mafiaLineup(players: number): IceRole[] {
  const special: IceRole[] = players >= 6 ? ["mafia", "mafia", "police", "doctor"] : ["mafia", "police"];
  return [...special, ...Array<IceRole>(players - special.length).fill("citizen")];
}

/** 자리마다 역할을 나눈다. 라이어 게임이면 주제·제시어도 함께 고른다. */
export function deal(
  game: IceGameKey,
  memberIds: string[],
): { roles: Map<string, IceRole>; topic: string | null; word: string | null } {
  const roles = new Map<string, IceRole>(memberIds.map((id) => [id, "citizen"]));

  if (game === "liar") {
    const [liar] = pickIndexes(memberIds.length, 1);
    roles.set(memberIds[liar], "liar");
    const { topic, words } = LIAR_TOPICS[randomInt(LIAR_TOPICS.length)];
    return { roles, topic, word: words[randomInt(words.length)] };
  }

  const lineup = mafiaLineup(memberIds.length);
  const seats = pickIndexes(memberIds.length, memberIds.length);
  seats.forEach((seat, i) => roles.set(memberIds[seat], lineup[i]));
  return { roles, topic: null, word: null };
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

/** 라이어 게임의 결과 문장. 제시어 맞히기는 말로 하므로 거기까지는 앱이 판정하지 않는다. */
export function liarOutcome(caught: boolean): string {
  return caught
    ? "라이어를 찾았습니다. 이제 라이어가 제시어를 맞혀 보세요 — 맞히면 라이어의 역전승입니다."
    : "라이어를 찾지 못했습니다. 라이어의 승리입니다.";
}

/** 마피아가 끝났는지. 끝났으면 결과 문장, 아니면 null. */
export function mafiaOutcome(aliveRoles: IceRole[]): string | null {
  const mafia = aliveRoles.filter((r) => r === "mafia").length;
  if (mafia === 0) return "마피아가 모두 탈락했습니다. 시민 승리입니다.";
  if (mafia >= aliveRoles.length - mafia) return "마피아 수가 나머지와 같아졌습니다. 마피아 승리입니다.";
  return null;
}
