"use server";

import { revalidatePath } from "next/cache";
import { parseBirth, type BirthBlock } from "@/lib/saju/input";
import { db } from "@/server/db";
import { getSessionMember } from "@/server/session";

/**
 * 내 사주 — 생년월일(시) 등록·지우기.
 *
 * 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수 있어서 **입력을 여기서 다시 검사한다.**
 * 검사 규칙은 화면과 같은 `parseBirth` 한 곳에 있다. 실패는 던지지 않고 돌려준다 —
 * 운영 빌드의 Next 는 던진 오류의 문구를 지워서, 던지면 화면에 아무 말도 남지 않는다.
 *
 * **사주는 역할 배정에 쓰지 않는다.** 이 값을 읽는 곳은 `getMySaju`(내 화면)뿐이고,
 * `candidatesFor`(`actions/roles`)는 이 열을 보지 않는다 — `scripts/smoke-saju.mts` 가 지킨다.
 */

/** 문자열 아닌 값이 POST 로 들어와도 `.trim()` 에서 죽지 않게 하고, 터무니없이 긴 값은 자르지 않고 거절한다. */
const MAX_FIELD = 32;

export async function saveMyBirth(
  date: string,
  time: string | null,
): Promise<"ok" | "invalid" | BirthBlock> {
  const session = await getSessionMember();
  if (!session) return "invalid";
  if (typeof date !== "string" || date.length > MAX_FIELD) return "bad-date";
  if (time !== null && (typeof time !== "string" || time.length > MAX_FIELD)) return "bad-time";

  const parsed = parseBirth(date, time);
  if (!parsed.ok) return parsed.reason;

  await db.member.update({
    where: { id: session.id },
    data: { birthDate: parsed.date, birthTime: parsed.time },
  });

  revalidatePath("/team/access");
  return "ok";
}

/** 등록한 생년월일(시)을 지운다. 지우면 팀 화면에서도 내 일간·오행이 사라진다(저장된 파생값이 없다). */
export async function clearMyBirth(): Promise<"ok" | "invalid"> {
  const session = await getSessionMember();
  if (!session) return "invalid";

  await db.member.update({
    where: { id: session.id },
    data: { birthDate: null, birthTime: null },
  });

  revalidatePath("/team/access");
  return "ok";
}
