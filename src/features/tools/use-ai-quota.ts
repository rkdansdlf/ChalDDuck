"use client";

import { useEffect, useState } from "react";
import { getAiQuota } from "@/server/actions/ai";

/**
 * 오늘 남은 AI 횟수. **읽기만 한다** — 부른다고 한도가 줄지 않는다
 * (`ai/limit.ts` 의 `aiQuotaFor` 가 쓰는 쪽과 같은 함수다).
 *
 * 화면이 이걸 보고 **경고한다.** 예전에는 한도가 다 될 때까지 아무 말 없이 잘 되다가, 버튼을
 * 눌렀을 때 "다 썼습니다"가 떴다. 막혔다고 불리기 전까지는 근본 원인을 알 수 없었다.
 *
 * 키가 없을 때는 셀 것도 없다 — 모델을 부르지 않으므로 한도와 무관하다. 그래서 키가 없는
 * 화면에서 이 값을 보여 주면 사실과 어긋난다.
 */
export function useAiQuota(enabled = true): { left: number; perDay: number } {
  const [quota, setQuota] = useState<{ left: number; perDay: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getAiQuota()
      .then((q) => {
        if (!cancelled) setQuota({ left: q.mineLeft, perDay: q.perDay });
      })
      .catch(() => {
        // 못 읽어도 도구는 쓸 수 있다 — 경고가 빠질 뿐 막히지 않는다.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return quota ?? { left: 0, perDay: 0 };
}
