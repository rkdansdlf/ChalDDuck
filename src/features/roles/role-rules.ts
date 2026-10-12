import type { Role, RoleKind } from "@/lib/types";

/**
 * 07 역할 편집의 **규칙** — 서버 액션과 화면이 같은 값을 쓴다.
 *
 * 기획안에 역할 수·이름 길이의 기준은 없다. 아래 상한은 **기능이 깨지지 않게 하는 안전선**이지
 * 정책이 아니다 — 화면에 5개가 한 줄에 들어가고, 부담 막대와 추천이 모든 역할을 한 면에 그린다.
 */
export const MAX_ROLES = 12;
export const MAX_ROLE_NAME = 20;
export const MAX_ROLE_NOTE = 60;

const KINDS: readonly RoleKind[] = ["core", "ops", "support"];

export function parseRoleKind(value: unknown): RoleKind | null {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value) ? (value as RoleKind) : null;
}

/** 이름·설명의 정규형 — 이름은 신원처럼 조회되므로 한글 분해형과 공백을 맞춘다. */
export function normalizeRoleText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export type RoleInputError = "empty-name" | "long-name" | "long-note" | "bad-kind" | "name-taken" | "too-many";

/** 화면이 그대로 보여 주는 말. */
export const ROLE_ERROR_TEXT: Record<RoleInputError, string> = {
  "empty-name": "역할 이름을 적어 주세요",
  "long-name": `이름은 ${MAX_ROLE_NAME}자까지 적을 수 있어요`,
  "long-note": `설명은 ${MAX_ROLE_NOTE}자까지 적을 수 있어요`,
  "bad-kind": "핵심·운영·보조 중에서 골라 주세요",
  "name-taken": "같은 이름의 역할이 이미 있어요",
  "too-many": `역할은 ${MAX_ROLES}개까지 둘 수 있어요`,
};

/**
 * 역할 하나의 입력을 검사한다. `others` 는 **자기를 뺀** 같은 팀의 역할들이다.
 *
 * 이름 중복은 정규형으로 본다 — "PPT  제작" 과 "PPT 제작" 이 둘이면 한 줄에서 갈라진다.
 */
export function checkRoleInput(
  input: { name: string; note: string; kind: unknown },
  others: readonly Pick<Role, "name">[],
): { ok: true; name: string; note: string; kind: RoleKind } | { ok: false; error: RoleInputError } {
  const name = normalizeRoleText(input.name);
  const note = normalizeRoleText(input.note);
  const kind = parseRoleKind(input.kind);
  if (name.length === 0) return { ok: false, error: "empty-name" };
  if (name.length > MAX_ROLE_NAME) return { ok: false, error: "long-name" };
  if (note.length > MAX_ROLE_NOTE) return { ok: false, error: "long-note" };
  if (kind === null) return { ok: false, error: "bad-kind" };
  if (others.some((o) => normalizeRoleText(o.name) === name)) return { ok: false, error: "name-taken" };
  return { ok: true, name, note, kind };
}
