import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "./db";

/**
 * 세션 = 기기 하나.
 *
 * 찰떡은 가입·로그인이 없고 **초대 코드 + 이름**으로 들어온다. 그래서 세션은
 * "이 브라우저가 어느 팀원인지"만 기억한다.
 *
 * 쿠키에는 임의 토큰만 담고 회원 식별자는 담지 않는다 — 쿠키 값을 고쳐서 남이 되는 일을
 * 막기 위해서다. 토큰과 회원의 연결은 서버(`Session` 표)에만 있다.
 *
 * 세션은 **서버에서도 만료된다.** 쿠키 만료만 믿으면 쿠키 값을 한 번 얻은 쪽이
 * 영원히 쓸 수 있다 — 쿠키는 가져간 사람이 마음대로 붙잡아 둘 수 있기 때문이다.
 *
 * 이름만으로 남이 되는 구멍은 `server/actions/rejoin.ts` 에서 막는다 — 이미 있는
 * 이름으로 새 기기에서 들어오려면 재입장 코드나 팀장 승인이 필요하다.
 */
const COOKIE = "cd_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90일

/** `lastSeenAt` 을 얼마나 자주 고칠지. 매 요청마다 쓰면 읽기마다 쓰기가 한 번씩 붙는다. */
const SEEN_THROTTLE_MS = 60 * 60 * 1000;

export type SessionMember = {
  id: string;
  teamId: string;
  name: string;
  /** 팀을 만든 사람. 새 기기 재입장 요청을 승인할 수 있다. */
  isLeader: boolean;
};

/** 기기 목록에 보일 짧은 설명. 정확할 필요는 없고 "내 것"인지 알아볼 정도면 된다. */
export async function describeDevice(): Promise<string> {
  const agent = (await headers()).get("user-agent") ?? "";

  const os = /iPhone/i.test(agent)
    ? "iPhone"
    : /iPad/i.test(agent)
      ? "iPad"
      : /Android/i.test(agent)
        ? "Android"
        : /Macintosh/i.test(agent)
          ? "Mac"
          : /Windows/i.test(agent)
            ? "Windows"
            : "기기";

  // 순서가 중요하다 — Chrome 의 UA 에는 Safari 도 들어 있다.
  const browser = /Edg\//i.test(agent)
    ? "Edge"
    : /OPR\//i.test(agent)
      ? "Opera"
      : /Chrome\//i.test(agent)
        ? "Chrome"
        : /Firefox\//i.test(agent)
          ? "Firefox"
          : /Safari\//i.test(agent)
            ? "Safari"
            : "브라우저";

  return `${os} · ${browser}`;
}

/**
 * 지금 브라우저의 팀원. 세션이 없거나 끊겼거나 만료됐으면 null.
 *
 * `cache()`로 감싼다 — `src/data/api.ts`의 함수 17개가 각자 이걸 부르는데,
 * 화면 하나가 그중 여러 개를 쓰면(예: 팀 채팅 화면이 `getCurrentTeam` +
 * `getTeamMessages` + `getRoster`) 감싸지 않을 경우 요청 하나에 같은 세션 조회가
 * 그 개수만큼 DB 왕복을 만든다. Supabase 가 원거리 리전이라 이게 메뉴 전환마다
 * 체감되는 지연의 주 원인이었다.
 */
export const getSessionMember = cache(async (): Promise<SessionMember | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      lastSeenAt: true,
      member: { select: { id: true, teamId: true, name: true, isLeader: true, leftAt: true } },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.deleteMany({ where: { token } });
    return null;
  }

  // 팀을 나간 사람의 세션은 더 이상 통하지 않는다. 행은 남아 있어도 팀원은 아니다.
  if (session.member.leftAt) {
    await db.session.deleteMany({ where: { memberId: session.member.id } });
    return null;
  }

  // 기기 목록의 "마지막 사용"을 위한 값이라 대략이면 된다.
  if (Date.now() - session.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
    await db.session.update({ where: { token }, data: { lastSeenAt: new Date() } });
  }

  const { leftAt: _leftAt, ...member } = session.member;
  return member;
});

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

/** 팀장만 할 수 있는 일에 쓴다. */
export async function requireLeader(): Promise<SessionMember> {
  const member = await requireSessionMember();
  if (!member.isLeader) throw new Error("팀장만 할 수 있습니다.");
  return member;
}

/**
 * 이 브라우저를 한 팀원에 묶는다.
 *
 * `token` 을 받을 수 있는 이유: 팀장이 승인한 재입장 요청은 **요청한 브라우저가 들고 있던
 * 토큰**으로 세션이 만들어져야 한다. 승인하는 사람의 브라우저에 쿠키를 심으면 안 된다.
 */
export async function startSession(memberId: string, token: string = randomUUID()) {
  await db.session.create({
    data: {
      token,
      memberId,
      label: await describeDevice(),
      expiresAt: new Date(Date.now() + MAX_AGE_SECONDS * 1000),
    },
  });

  await setSessionCookie(token);
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  store.delete(COOKIE);
}

/**
 * 기기 목록에서 기기를 가리키는 값.
 *
 * 토큰을 그대로 화면에 내보내면 안 된다 — 토큰은 그 기기의 세션 그 자체라, 쿠키를
 * `httpOnly` 로 숨긴 뜻이 없어진다(예전에는 다른 기기들의 토큰이 목록에 실려 내려갔다).
 * 해시로는 세션을 만들 수 없고, 서버는 내 세션들을 해시해 같은 것을 찾는다.
 */
export function deviceIdOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 지금 이 브라우저의 토큰. 기기 목록에서 "이 기기"를 표시할 때 쓴다. */
export async function currentSessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}
