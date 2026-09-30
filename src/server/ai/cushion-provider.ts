import "server-only";

import { buildPurifyRequest, isRefusal, type PurifyItem } from "@/lib/read-cushion";
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
  /**
   * `system` 이 **읽는 강도까지 담아서** 온다(`tools.ts` 가 `levelGuide` 를prompt에 넣는다)라
   * provider 는 `level` 을 따로 받지 않는다 — 강도를 따로 받는 순간 두 값이 갈라질 수 있다.
   */
  purify(input: {
    items: PurifyItem[];
    system: string;
  }): Promise<{ raw: string; refused: boolean }>;
};

function openRouterProvider(id: string): CushionProvider {
  return {
    id,
    async purify({ items, system }) {
      if (!isAiConfigured()) throw new Error("AI 가 연결되어 있지 않습니다.");
      const raw = await askText({
        tool: "read-cushion",
        system,
        user: buildPurifyRequest(items),
        maxTokens: 1200,
        // provider 가 id 를 직접 받았을 때만 그 슬러그를 쓴다. 기본 provider 는 id 가
        // **비어 있고**(`defaultProvider` 아래 참고), 그러면 `modelFor("read-cushion")` 이
        // `.env` 의 도구별 설정을 그대로 고른다 — 라우팅과 벤치가 한 값을 본다.
        ...(id ? { model: id } : {}),
      });
      return { raw, refused: isRefusal(raw) };
    },
  };
}

/**
 * 지금 쓰는 provider.
 *
 * **기본값은 여기서 정하지 않는다.** 예전에는 `.env` 의 `OPENROUTER_MODEL` 을 여기서 다시
 * 읽어 provider 의 id 로 삼았는데, 그건 같은 값을 **두 곳에서** 고른 셈이라 도구별 라우팅이
 * 켜졌을 때 어긋났다(읽기 순화만 옛 기본값을 쓰는 것이 실제로 벌어졌다). 이제 이 id 는
 * 비어 있고, `askText` 가 `modelFor("read-cushion")` 을 본다 — **모델을 고르는 자리는 한 곳.**
 */
export function defaultProvider(): CushionProvider {
  return openRouterProvider("");
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
