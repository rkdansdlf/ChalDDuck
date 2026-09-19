import "server-only";

import { cookies } from "next/headers";
import { db } from "./db";

/**
 * 세션.
 *
 * 찰떡은 가입·로그인이 없고 **초대 코드 + 이름**으로 들어온다. 그래서 세션은
 * "이 브라우저가 어느 팀원인지"만 기억한다.
 *
 * 쿠키에는 임의 토큰만 담고 회원 식별자는 담지 않는다 — 쿠키 값을 고쳐서 남이 되는 일을
 * 막기 위해서다. 토큰과 회원의 연결은 서버(`Session` 표)에만 있다.
 *
 * ⚠️ **남은 구멍**: 이름만 알면 같은 팀의 다른 사람으로 처음부터 들어올 수 있다
 * (02 화면의 "본인 확인" 시트는 안내일 뿐 막지 못한다). 기획의 재입장 규칙이 확정되면
 * 기기 토큰이나 팀원 승인 같은 단계를 넣어야 한다.
 */
const COOKIE = "cd_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90일

export type SessionMember = {
  id: string;
  teamId: string;
  name: string;
};

/** 지금 브라우저의 팀원. 세션이 없거나 끊겼으면 null. */
export async function getSessionMember(): Promise<SessionMember | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    select: { member: { select: { id: true, teamId: true, name: true } } },
  });
  return session?.member ?? null;
}

/**
 * 세션이 반드시 있어야 하는 곳에서 쓴다.
 *
 * **모든 서버 액션은 이걸로 시작해야 한다.** 서버 액션은 화면을 거치지 않고 POST 로
 * 바로 불릴 수 있어서, 화면에서 막았다고 안전하지 않다.
 */
export async function requireSessionMember(): Promise<SessionMember> {
  const member = await getSessionMember();
  if (!member) throw new Error("로그인이 필요합니다.");
  return member;
}

/** 로그인 — 이 브라우저를 한 팀원에 묶는다. */
export async function startSession(memberId: string) {
  const token = crypto.randomUUID();
  await db.session.create({ data: { token, memberId } });

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  store.delete(COOKIE);
}
