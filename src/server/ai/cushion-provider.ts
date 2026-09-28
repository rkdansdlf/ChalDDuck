import "server-only";

import { buildPurifyRequest, isRefusal, type PurifyItem } from "@/lib/read-cushion";
import type { CushionLevelKey } from "@/lib/types";
import { askText, isAiConfigured } from "./model";

/**
 * 읽기 순화를 부르는 **자리**.
 *
 * ## 왜 인터페이스가 있나
 *
 * 실측이 이랬다: `openrouter/free` 는 협조적 말 3/3, 심한 욕설 **0/3**(안전 필터 명시적 거절),
 * 그리고 거절하지 않는 무료 모델을 직접 골라도 **욕을 그대로 남겼다**(3/3). 이때 "유료 모델로
 * 바꾸면 되나" 는 **느낌으로 답할 수 없다.** 같은 입력으로 나란히 불러야 한다.
 *
 * 그래서 부르는 자리를 하나만 남기고(model 을 받는 `askText`), **어느 모델로 부르는지만
 * 바꾼다.** provider 를 늘리는 건 한 줄이고, 화면·액션·계약은 손대지 않는다.
 *
 * 계약은 하나다: `purify` — 항목 배열을 받아 항목 배열을 돌려준다. **순서·개수는 신뢰하지 않는다**
 * (검사가 `id` 로 맞춘다), 그래서 provider 마다 응답 모양이 달라도 파이프라인은 같다.
 */
export type CushionProvider = {
  /** 지표와 벤치에 남는 이름. */
  id: string;
  purify(input: {
    items: PurifyItem[];
    system: string;
    level: CushionLevelKey;
  }): Promise<{ raw: string; refused: boolean }>;
};

function openRouterProvider(id: string): CushionProvider {
  return {
    id,
    async purify({ items, system, level }) {
      if (!isAiConfigured()) throw new Error("AI 가 연결되어 있지 않습니다.");
      const raw = await askText({
        system,
        user: buildPurifyRequest(items),
        maxTokens: 1200,
        // id 가 "openrouter/free" 면 기본값을 그대로 쓴다 — 경로를 두 개 만들지 않는다.
        ...(id === DEFAULT_PROVIDER_ID ? {} : { model: id }),
      });
      return { raw, refused: isRefusal(raw) };
    },
  };
}

/** `.env` 가 없으면 이 이름이 된다. */
const DEFAULT_PROVIDER_ID = process.env.OPENROUTER_MODEL || "openrouter/free";

/** 지금 쓰는 provider. */
export function defaultProvider(): CushionProvider {
  return openRouterProvider(DEFAULT_PROVIDER_ID);
}

/**
 * 이름으로 provider 를 고른다(벤치용).
 *
 * 모르는 이름도 그대로 통과한다 — OpenRouter 가 404 를 주면 그때 실패한다. **화면에서 오는
 * 이름이 아니라 개발자가 코퍼스를 돌릴 때만 쓰는 자리**라 화이트리스트가 필요 없다.
 */
export function providerById(id: string): CushionProvider {
  return openRouterProvider(id);
}
