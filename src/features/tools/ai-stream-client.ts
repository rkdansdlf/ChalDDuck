"use client";

import { flush, newLineSplitter, pushBytes } from "@/lib/ai-stream-lines";
import type { AiAnswerSource } from "@/lib/types";

/**
 * AI 초안을 **조각으로** 받아온다(15 쿠션 번역기 · 27 문장 변환).
 *
 * ## 왜 서버 액션이 아니라 `fetch` 인가
 *
 * 서버 액션은 `fetch` 로 직접 부를 수 없다 — Next 가 알아서 붙이는 액션 헤더와 CSRF 가
 * 있기 때문이다. 스트리밍을 하려면 바디를 **조각으로** 읽어야 하니 `fetch` 가 필요하다
 * (`/api/ai/stream` — 그쪽이 `runTool` 을 거쳐 한도·환불을 그대로 지킨다).
 *
 * ## 돌려주는 값은 **비스트리밍일 때와 같다**
 *
 * `{ value, source }` — `readAi` 가 기대하는 바로 그 모양이다. 그래서 화면이 어느 길로
 * 부르든 `useAiDraft` 안쪽이 달라지지 않는다. **스트리밍은 도착 방법일 뿐 계약이 아니다.**
 * (이걸 깨면 "스트리밍 화면만 출처를 모른다" 는 종류의 버그가 생긴다.)
 *
 * ## 조각을 받는 동안 무엇을 화면에 보여 주는가
 *
 * `onDelta` 로 **누적한 글**을 그대로 넘긴다. 서버는 값을 `trim()` 해 주지만 조각은 trim
 * 전이라 잠깐 공백이 남을 수 있다 — 그건 다듬는 중인 글이다. 마지막 줄의 `value` 로
 * **덮어쓴다**, 이어 붙이지 않는다. 그래야 스트리밍을 켜고 끈 화면의 최종 글자가 한 글자도
 * 다르지 않다.
 */

/** 조각을 누적하는 중 상태. **호출마다 새로 만든다** — 모듈 변수로 두면 두 호출이 섞인다. */
type StreamState = {
  partial: string;
  settled: { value: string; source: AiAnswerSource } | null;
};

export async function runAiStream(input: {
  tool: "cushion" | "sentence";
  text: string;
  variant: string;
  onDelta?: (partial: string) => void;
}): Promise<{ value: string; source: AiAnswerSource }> {
  const response = await fetch("/api/ai/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: input.tool, text: input.text, variant: input.variant }),
  });

  /**
   * 요청 자체가 실패한 경우(세션 없음·잘못된 도구). **여기서는 조각이 없으므로** `onDelta` 를
   * 부를 수 없다 — 서버가 한국어 문구를 담아 4xx 로 돌려준다.
   */
  if (!response.ok || !response.body) {
    const message = await response
      .json()
      .then(
        (body: unknown) =>
          typeof (body as { error?: unknown })?.error === "string"
            ? (body as { error: string }).error
            : null,
      )
      .catch(() => null);
    throw new Error(message ?? "AI 응답을 받지 못했습니다.");
  }

  const state: StreamState = { partial: "", settled: null };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const splitter = newLineSplitter();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    /**
     * **바이트가 아니라 글자 단위로 자른다.**
     *
     * 한국어는 한 글자가 3바이트라 바이트 경계에서 잘라 문자열로 만들면 깨진다.
     * `TextDecoder` 가 그 처리를 해 주지만 **한 바이트씩 쪼개서 디코딩해야** 한다 —
     * `{ stream: true }` 가 중간멈춤 바이트를 다음에 붙여 준다. 이 분리는 순수 함수
     * (`lib/ai-stream-lines.ts`)로 따로 두고 스모크가 확인한다.
     */
    for (const line of pushBytes(splitter, value, (bytes) => decoder.decode(bytes, { stream: true }))) {
      applyLine(line, state, input.onDelta);
    }
  }
  // 마지막 줄에 개행이 없을 수 있다 — 서버가 stream 을 닫으면서 마지막 프레임을 밀어 넣는다.
  const tail = flush(splitter);
  if (tail) applyLine(tail, state, input.onDelta);

  if (!state.settled) throw new Error("AI 응답이 중간에 끊겼습니다.");
  return state.settled;
}

/** 한 줄을 읽고 · 조각이면 누적해 알리고 · 마지막 줄이면 완성값을 확정한다. */
function applyLine(
  line: string,
  state: StreamState,
  onDelta: ((partial: string) => void) | undefined,
): void {
  let frame: unknown;
  try {
    frame = JSON.parse(line);
  } catch {
    /**
     * **깨진 줄은 조용히 넘긴다.**
     *
     * 서버가 `JSON.stringify` 로 만들기 때문에 실제로 깨진 줄은 나오지 않는다. 그래도
     * **화면이 죽는 것보다 한 줄을 잃는 것이 낫다** — 완성값은 마지막 줄에 있으므로 결과는
     * 그대로 온다. 여기서 `throw` 하면 프로토콜 오염 한 조각이 사용자 세션 전체를 막는다.
     */
    return;
  }

  const { delta, source, value, error } = frame as {
    delta?: unknown;
    source?: unknown;
    value?: unknown;
    error?: unknown;
  };

  // 실패는 **서버가 환불까지 끝낸 뒤** 보낸다. 여기서 던지면 화면은 그 문구를 그대로 보여 준다.
  if (typeof error === "string") throw new Error(error);

  if (typeof value === "string" && (source === "ai" || source === "sample")) {
    state.settled = { value, source };
    return;
  }

  if (typeof delta === "string" && delta) {
    // 이미 확정됐으면(비정상적으로 뒤에 조각이 더 온 경우) 손대지 않는다.
    if (state.settled) return;
    state.partial += delta;
    onDelta?.(state.partial);
  }
}
