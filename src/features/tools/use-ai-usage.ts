"use client";

import { useEffect, useState } from "react";
import { getAiUsageToday } from "@/server/actions/ai";

/**
 * 오늘 **몇 번 썼는지** 읽어 온다. **읽기만 한다** — 부른다고 기록되지 않는다
 * (`ai/limit.ts` 의 `aiUsageToday` 가 쓰는 쪽과 같은 함수다).
 *
 * ## 왜 "몇 번 썼는지"를 보여 주나 (2026-09-28)
 *
 * 원래는 "몇 회 남았는지" 였다. **한도가 없어졌으므로 남은 횟수는 거짓이다** — 없는 것을
 * 남은 것으로 말할 수 없다. 그러면 도구 화면마다 붙어 있던 숫자도 모두 거짓이었고, 그 숫자로
 * **버튼을 막고 있었다**(모두 쓴 경우). 한도 없는 앱에서 "다 썼습니다" 는 말하면 안 된다.
 *
 * 쓰는 횟수를 말하는 것은 **측정치**다 — 팀이 하루에 몇 번 쓰는지에 대한 유일한 답이고,
 * 다음에 이 숫자를 결정할 때 그 근거가 된다.
 */
export function useAiUsageToday(enabled = true): { used: number; readable: boolean } {
  const [usage, setUsage] = useState<{ used: number; readable: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getAiUsageToday()
      .then((q) => {
        if (!cancelled) setUsage({ used: q.mine, readable: true });
      })
      .catch(() => {
        // 못 읽어도 도구는 쓸 수 있다 — 숫자 하나가 빠질 뿐 막히지 않는다.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return usage ?? { used: 0, readable: false };
}

/**
 * **읽기 도움**를 오늘 몇 번 돌렸는지 — 도구와 따로 센다(`server/ai/limit.ts`).
 *
 * 읽기 도움은 **누가 누를 때만 일어나지 않는다** — 메시지마다 자동으로 돈다. 그래서 도구 화면처럼
 * 버튼 옆에 숫자를 붙여 놓으면, AI 를 **요청하지 않은** 사람이 숫자를 재워 본다. 그래서 이 값은
 * 읽기 도움 화면에서만 읽는다.
 */
export function useCushionUsageToday(enabled = true): { used: number; readable: boolean } {
  const [usage, setUsage] = useState<{ used: number; readable: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getAiUsageToday()
      .then((q) => {
        if (!cancelled) setUsage({ used: q.cushionMine, readable: true });
      })
      .catch(() => {
        // 못 읽어도 읽기는 된다 — 읽기 도움이 안 되는 것이지 대화를 못 보는 것이 아니다.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return usage ?? { used: 0, readable: false };
}
