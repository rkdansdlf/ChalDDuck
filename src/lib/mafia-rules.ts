import type { IceRole } from "@/lib/types";

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
 * 인원수에 맞는 역할 목록. 모자라면(null) 그 인원으로 하는 판은 없다.
 *
 * 프리셋에 없는 인원이면 **가장 큰 프리셋에 시민을 더한다** — 12명은 10명 구성 + 시민 2명.
 * 역할 종류를 새로 지어내지 않고 인원만 늘리므로, 아무도 모르는 역할이 나오지 않는다.
 */
export function mafiaLineup(players: number): IceRole[] | null {
  if (players < MAFIA_MIN_PLAYERS) return null;
  const preset = MAFIA_PRESETS.find((p) => p.players === players) ?? MAFIA_PRESETS[MAFIA_PRESETS.length - 1];
  return [...preset.roles, ...Array<IceRole>(Math.max(0, players - preset.players)).fill("citizen")];
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
  if (!lineup) return `${MAFIA_MIN_PLAYERS}명부터`;
  const { mafia, police, doctor, citizen } = countRoles(lineup);
  return `마피아 ${mafia} · 경찰 ${police} · 의사 ${doctor} · 시민 ${citizen}`;
}

/** 마피아가 이겼는지. 아직 끝나지 않았으면 null. */
export type MafiaSide = "citizen" | "mafia";

export function mafiaWinner(aliveRoles: IceRole[]): MafiaSide | null {
  const mafia = aliveRoles.filter((r) => r === "mafia").length;
  if (mafia === 0) return "citizen";
  if (mafia >= aliveRoles.length - mafia) return "mafia";
  return null;
}

/** 마피아가 끝났는지. 끝났으면 결과 문장, 아니면 null. */
export function mafiaOutcome(aliveRoles: IceRole[]): string | null {
  const side = mafiaWinner(aliveRoles);
  if (side === "citizen") return "마피아가 모두 탈락했습니다. 시민 승리입니다.";
  if (side === "mafia") return "마피아 수가 나머지와 같아졌습니다. 마피아 승리입니다.";
  return null;
}
