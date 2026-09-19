import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 재입장 코드.
 *
 * 기기를 바꿨을 때 팀장을 기다리지 않고 혼자 돌아오기 위한 값이다. 실질은 비밀번호지만
 * **사용자가 만들지 않는다** — 첫 입장 때 서버가 만들어 한 번만 보여 주고, 그 뒤로는
 * 해시만 남는다. 비밀번호 칸도, 계정 만들기도 없이 같은 일을 한다.
 *
 * 앱의 약속이 "가입·로그인 없음"이라, 이것을 "로그인"이라 부르지 않는다.
 */

/** 사람이 옮겨 적기 쉽도록 헷갈리는 글자(0/O, 1/I)를 뺀다. 초대 코드와 같은 어휘. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 네 글자씩 세 덩이 = 32^12 ≈ 10^18. 찍어서 맞힐 수 없는 크기다. */
const GROUPS = 3;
const PER_GROUP = 4;

export function createRejoinCode(): string {
  const bytes = randomBytes(GROUPS * PER_GROUP);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return Array.from({ length: GROUPS }, (_, i) =>
    chars.slice(i * PER_GROUP, (i + 1) * PER_GROUP).join(""),
  ).join("-");
}

/** 사람이 적은 값을 비교 가능한 모양으로 — 대소문자·공백·하이픈을 무시한다. */
export function normalizeRejoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * `salt:hash` 로 만든다.
 *
 * 코드 자체가 충분히 길어 단순 해시로도 되지만, scrypt 를 쓰면 표가 통째로 새어도
 * 대입 비용이 남는다. 저장하는 값이 무엇인지 헷갈리지 않게 형식을 고정해 둔다.
 */
export function hashRejoinCode(code: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizeRejoinCode(code), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

/** 길이가 달라도 같은 시간이 걸리도록 비교한다. */
export function verifyRejoinCode(code: string, stored: string | null): boolean {
  if (!stored) return false;

  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(normalizeRejoinCode(code), salt, expected.length);
  return timingSafeEqual(expected, actual);
}
