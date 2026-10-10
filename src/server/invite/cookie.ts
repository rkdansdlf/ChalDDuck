import "server-only";

import { cookies } from "next/headers";

/**
 * "이 요청은 초대 링크로 왔다"를 **브라우저에만** 심어 두는 통로.
 *
 * ## 왜 쿠키인가
 *
 * 초대 토큰을 온보딩 단계마다 URL 로 이어 붙이면(`/onboarding/name?code=..&t=..`) 화면 3~4개와
 * 상태 파일을 다 고쳐야 하고, **화면이 그 값을 신뢰하게 된다.** 흩어진 값 하나가 어디서
 * 들어왔는지 알 수 없으면, 나중에 "이 요청은 어느 공유로 왔나"를 못 본다.
 *
 * 서버가 심고 서버가 읽는다. 화면은 이 값의 존재도, 내용도 모른다 — 그래서 화면이 임의로
 * `inviteId` 를 지목할 수 없고, **서버가 해시로 다시 찾아 유효성을 재확인한다.**
 *
 * ## 이건 증명이 아니다
 *
 * 이 쿠키는 **출처 기록**이지 권한이 아니다. 누군가 토큰을 지워도 `Team.code` 로 신청할 수
 * 있고, 팀장 승인은 그대로 받는다. 그래야 하는 이유가 있다 — 토큰은 설명이고, 권한은
 * 팀장의 클릭이다.
 *
 * 따라서 값을 위조해도 얻는 것이 없다. 위조하려면 그 팀의 `TeamInvite` 행을 알아야 하는데,
 * `id` 를 알고 있다는 사실은 아무것도 열어 주지 않는다.
 */
const INVITE_COOKIE = "cd_invite";

const OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  // 하루. 팀을 만들고 바로 팀원들을 부르는 흐름이 여러 번 걸칠 수 있다 — 오래 두지 않는다.
  maxAge: 60 * 60 * 24,
} as const;

export async function rememberInviteToken(rawToken: string): Promise<void> {
  (await cookies()).set(INVITE_COOKIE, rawToken, OPTIONS);
}

/** 심어진 원문 토큰. 없으면 null — `Team.code` 로 온 요청이 그쪽이다. */
export async function readInviteToken(): Promise<string | null> {
  return (await cookies()).get(INVITE_COOKIE)?.value ?? null;
}

/** 소비되었거나 불일치하는 초대 토큰 쿠키를 삭제한다. */
export async function forgetInviteToken(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}
