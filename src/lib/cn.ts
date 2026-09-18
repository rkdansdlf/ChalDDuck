/** 조건부 className 결합. clsx 의 최소 대체물 — 문자열/거짓값만 다룬다. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
