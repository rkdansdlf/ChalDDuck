"use client";

import type { AiAnswerSource, AiResult } from "@/lib/types";

/**
 * 서버가 돌려준 실패를 화면 쪽 오류로 바꾼다.
 *
 * 도구 화면 5개가 이미 `try/catch` 로 실패를 받아 `AiErrorNote` 에 문구를 보여 주고 있어서,
 * 그 모양을 그대로 쓰게 하려는 것이다. **던지는 곳이 브라우저**라는 점이 핵심이다 —
 * 서버에서 던졌으면 운영 빌드에서 문구가 지워진 채 도착한다(`server/actions/ai.ts` 참고).
 *
 * ## 왜 값만 돌려주지 않는가
 *
 * 예전에는 성공에서 `value` 만 꺼내면 됐다. 그래서 `unwrapAi` 를 남겼고, 다섯 화면이 전부
 * 그것을 썼다. 그랬더니 **결과가 모델 것인지 예시인지 화면마다 따로 알아내야 했고**, forgets한
 * 화면이 예시를 "AI 초안" 으로 보여 주었다. 출처를 버리는 이 함수가 그 실수의 입구였다.
 *
 * 출처를 **버릴 수 없게** 한다 — 돌아가는 값에 항상 붙어 있다(`AiAnswerSource`).
 */
export function readAi<T>(result: AiResult<T>): { value: T; source: AiAnswerSource } {
  if (result.ok) return { value: result.value, source: result.source };
  throw new Error(result.message);
}
