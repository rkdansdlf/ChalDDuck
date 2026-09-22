"use client";

import type { AiResult } from "@/lib/types";

/**
 * 서버가 돌려준 실패를 화면 쪽 오류로 바꾼다.
 *
 * 도구 화면 5개가 이미 `try/catch` 로 실패를 받아 `AiErrorNote` 에 문구를 보여 주고 있어서,
 * 그 모양을 그대로 쓰게 하려는 것이다. **던지는 곳이 브라우저**라는 점이 핵심이다 —
 * 서버에서 던졌으면 운영 빌드에서 문구가 지워진 채 도착한다(`server/actions/ai.ts` 참고).
 */
export function unwrapAi<T>(result: AiResult<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.message);
}
