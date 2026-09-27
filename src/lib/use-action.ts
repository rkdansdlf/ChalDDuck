"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 실패했을 때 기본으로 보여 주는 말. 서버가 던진 문구는 운영 빌드에서 지워진다. */
const DEFAULT_FAIL = "잠시 문제가 생겼습니다. 다시 시도해 주세요.";

/**
 * 서버 액션을 부르는 쪽을 한 곳에 모은다.
 *
 * **왜 필요한가.** 화면마다 `try { … } finally { … }` 를 손으로 쓰다 보니 `catch` 가
 * 빠졌다. 운영 빌드의 Next 는 서버가 던진 오류의 문구를 지우고 `digest` 만 보낸다
 * (`server/actions/ai.ts` 도 같은 이유로 명시한다). 그래서 빠진 `catch` 하나는
 * "버튼을 눌렀는데 아무 일도 일어나지 않는 화면"이 된다 — 사용자는 눌러 볼수록
 * 고장인 줄 알고, 우리는 로그에서도 원인을 찾을 수 없다.
 *
 * **`flash` 를 안 쓰는 이유.** 아래 `run` 이 실패를 삼킨다. 삼킨 이상 사용자에게
 * 보이는 말이 남아 있어야 하는데, `run` 이 `flash` 를 부르므로 화면마다 토스트 상태를
 * 따로 들 필요가 없다.
 */
export function useAction() {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // 알람을 하나만 든다. 예전에는 화면마다 `setTimeout` 을 새지도 정리하지 않아,
  // 다시 치고 뜬 알람이 더 늦게 끝난 이전 알람에 지워졌다( 안내가 순식간에 사라진다 ).
  const timer = useRef<number | null>(null);
  // 진행 중인 동작의 집합. `run` 안에서 `await` 하는 동안 같은 키로 두 번 눌러
  // 추첨 결과가 두 개 생기는 일(역할 수락 직후 즉시 거절)을 여기서 막는다.
  const running = useRef(new Set<string>());

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const done = useCallback((key: string) => {
    running.current.delete(key);
    setBusy((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
  }, []);

  /**
   * 서버 액션을 부르고, 성공 문구와 실패 문구를 화면에 남긴다.
   *
   * `fn` 이 돌려준 문자열이 성공 알림이 되고, `undefined` 면 알리지 않는다.
   * `fn` 이 던지면 `fail` (또는 기본 말)을 띄우고 **false** 를 돌려준다 — 다시 던지지
   * 않는다. 던지면 호출한 쪽의 `catch` 가 없으면 그것도 조용한 실패가 되기 때문이다.
   *
   * `key` 는 동작 하나를 가리킨다. 같은 키로 이미 돌고 있으면 아무 것도 하지 않고
   * 즉시 돌아간다 — 이중 제출이 그대로 서버에 닿지 않게 하는 가장 싼 지점이다.
   */
  const run = useCallback(
    async <T,>(
      key: string,
      fn: () => Promise<T | string | void> | T | string | void,
      fail: string = DEFAULT_FAIL,
    ): Promise<boolean> => {
      if (running.current.has(key)) return false;
      running.current.add(key);
      setBusy((prev) => ({ ...prev, [key]: true }));
      try {
        const result = await fn();
        if (typeof result === "string") flash(result);
        return true;
      } catch {
        flash(fail);
        return false;
      } finally {
        done(key);
      }
    },
    [done, flash],
  );

  return { toast, busy, flash, run };
}
