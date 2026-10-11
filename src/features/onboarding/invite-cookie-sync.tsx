"use client";

import { useEffect } from "react";
import { syncInviteCookie } from "@/server/actions/invite-cookie";

/**
 * 초대 쿠키를 `/join` 이 정한 대로 맞춘다. 아무것도 그리지 않는다.
 *
 * 페이지는 렌더 중에 쿠키를 쓸 수 없어서(`invite-cookie.ts` 머리말), 쓸 일이 있을 때만 이
 * 컴포넌트를 세운다. `token` 이 문자열이면 그 초대를 심고, `null` 이면 남은 쿠키를 지운다.
 * 서버가 값을 다시 확인하므로 여기서 거르지 않는다.
 */
export function InviteCookieSync({ token }: { token: string | null }) {
  useEffect(() => {
    void syncInviteCookie(token);
  }, [token]);
  return null;
}
