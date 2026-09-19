"use client";

import { useEffect, useState } from "react";

/**
 * 타이핑하는 동안 결과를 따라 만드는 도구(15 쿠션 번역기 · 27 문장 변환)의 공통 부분.
 *
 * 왜 필요한가: 두 화면은 원문이 바뀔 때마다 결과를 다시 받는다. 샘플을 돌려주던 때는
 * 공짜였지만 모델이 붙은 지금은 **글자 하나마다 호출 한 번**이 된다. 그래서
 *
 * - 입력이 멎고 나서 한 번만 부르고(디바운스),
 * - 서버가 이미 만들어 둔 첫 결과가 그대로면 아예 부르지 않고,
 * - 늦게 도착한 앞선 결과가 최신 입력을 덮어쓰지 않게 버린다.
 */

/** 입력이 멎었다고 보는 시간. 한 문장을 고쳐 쓰는 사이에는 부르지 않을 만큼 넉넉하게. */
const SETTLE_MS = 800;

export function useAiDraft({
  text,
  variant,
  initial,
  run,
}: {
  /** 바꿀 원문. */
  text: string;
  /** 원문 말고 결과를 바꾸는 값(말투·모드). 바뀌면 다시 부른다. */
  variant: string;
  /** 서버가 미리 만들어 둔 첫 결과와, 그 결과가 나온 원문·변형. */
  initial: { text: string; variant: string; result: string };
  run: (text: string, variant: string) => Promise<string>;
}): { result: string; working: boolean; error: string | null } {
  const [result, setResult] = useState(initial.result);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = text.trim();
    let cancelled = false;

    // 서버가 준 그대로면 이미 답이 있다 — 화면을 열자마자 호출이 나가면 안 된다.
    if (trimmed === initial.text.trim() && variant === initial.variant) {
      return;
    }

    // 원문이 비면 보여 줄 것도 없다. 아래에서 렌더 중에 비워 돌려주므로 여기서는 부르지만 않는다.
    if (!trimmed) return;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setWorking(true);
      setError(null);

      run(trimmed, variant)
        .then((value) => {
          if (!cancelled) setResult(value);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : "AI 응답을 받지 못했습니다.");
        })
        .finally(() => {
          if (!cancelled) setWorking(false);
        });
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, variant, initial.text, initial.variant, run]);

  // 원문이 비었을 때의 화면은 상태가 아니라 계산이다 — 효과 안에서 비우면
  // 렌더가 한 번 더 돌고, "비웠다가 다시 채우는" 중간 상태가 보인다.
  const empty = text.trim().length === 0;
  return {
    result: empty ? "" : result,
    working: empty ? false : working,
    error: empty ? null : error,
  };
}
