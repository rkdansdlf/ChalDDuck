"use server";

import { forgetInviteToken, rememberInviteToken } from "@/server/invite/cookie";
import { findInviteByToken } from "@/server/invite/service";

/**
 * `/join` 이 **렌더 중에는 못 하는** 쿠키 쓰기를 대신한다.
 *
 * 서버 컴포넌트는 쿠키를 읽기만 한다 — `set`·`delete` 는 서버 액션이나 라우트 핸들러에서만
 * 된다(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`). 예전에는
 * 페이지가 렌더 중에 불러서 개발 서버가 500 으로 죽었고, 운영에서는 오류 없이 **쿠키가 바뀌지
 * 않았다**(응답에 `Set-Cookie` 가 없다). 그래서 페이지가 값을 정하고, 브라우저가 이 액션을
 * 한 번 불러 쓰게 한다(`InviteCookieSync`).
 *
 * 이 액션은 **화면이 보낸 값을 믿지 않는다.** 토큰이 오면 서버가 해시로 다시 찾아 유효할 때만
 * 심는다 — 위조해도 얻는 것이 없다는 `cookie.ts` 머리말의 약속이 여기서도 그대로다.
 * `null` 이면 지운다. 지우는 쪽은 틀려도 잃는 게 출처 기록뿐이다.
 */
export async function syncInviteCookie(token: string | null): Promise<void> {
  if (token === null) {
    await forgetInviteToken();
    return;
  }
  const raw = typeof token === "string" ? token.trim() : "";
  if (!raw || !(await findInviteByToken(raw))) return;
  await rememberInviteToken(raw);
}
