"use client";

import type { MbtiType } from "@/lib/mbti";
import type { Member } from "@/lib/types";
import { useOnboarding } from "./onboarding-state";

/**
 * 지금 사용자의 이름과 유형.
 *
 * 서버 명단의 "나" 위에 온보딩에서 방금 고른 값을 덮어쓴다. 아직 서버에 보내지 않은
 * 선택이라도 내가 보내는 말에는 내가 고른 이름·캐릭터가 붙어야 한다.
 */
export function useMe(fromServer: Member | undefined): { name: string; mbti: MbtiType | null } {
  const { name, effectiveMbti } = useOnboarding();
  return {
    name: name.trim() || fromServer?.name || "나",
    mbti: effectiveMbti ?? fromServer?.mbti ?? null,
  };
}
