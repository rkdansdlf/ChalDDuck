"use client";

import { useCallback, useState } from "react";

import type { AiAnswerSource } from "@/lib/types";

/**
 * AI 초안 한 장을 **누가, 언제** 만들었는지.
 *
 * 화면이 "AI 초안" 배지를 어디에 붙이느냐를 정하는 근거다. 예전에는 배지가 곧 "모델이
 * 이걸 썼다" 를 뜻했는데, 키가 없을 때 미리 넣어 둔 예시도 같은 배지 아래에 있었다 — 그래서
 * 사람이 만든 것처럼 보였다. 출처를 따로 들면 배지가 사실에 닿는다.
 */
export type DraftSource = AiAnswerSource | "none";

/**
 * AI 초안을 **누를 때만** 만드는 도구(15 쿠션 번역기 · 27 문장 변환)의 공통 부분.
 *
 * ## 왜 자동으로 부르지 않나
 *
 * 예전에는 원문이 바뀌면 입력이 멎을 때마다(800ms) 자동으로 모델을 불렀다. 화면은 편했다.
 * 그런데 그 **한 번 한 번이 모두 과금이었고**, 사용자가 한 문장을 고쳐 쓰는 사이에 하루 한도
 * (기본값 60회)의 십몇 분이 갔다. 고치는 쪽이 고칠수록 나중에 안 되는 것 — 도구의 방향이
 * 뒤집힌다. **타이핑으로는 한 번도 부르지 않는다.**
 *
 * ## 왜 이 문장으로 굳었나
 *
 * 같은 앱의 나머지 세 도구(AI 서기·발표 지원·리서처)는 원래 다 버튼을 눌러야 돌아갔다.
 * 굳이 두 개만 자동으로 돌리던 것은 구현의 잔재였고, 그 잔재가 비용을 만들고 있었다.
 * 이제 다섯 개가 같은 규칙을 따른다.
 *
 * 한 번 만들어 놓고 같은 글·같은 말투로 다시 누르면 **부르지 않는다** — 이미 있는 답이니까.
 * 그래야 "결과가 그대로인데 한도만 줄었다" 는 일이 생기지 않는다.
 *
 * ## 조각으로 오는 동안 무엇을 보여 주는가
 *
 * `run` 이 세 번째 인자로 `onDelta` 를 받으면 **누적된 글**을 넘겨준다. 받으면 그 글과
 * `working` 이 함께 화면에 오른다 — "다듬는 중" 만 4초간 도는 것보다 나아 보인다.
 *
 * **받지 않는 도구도 있다**(서기·발표·리서처는 모양이 정해진 값이라 중간 글자가 뜻이 없다).
 * 그래도 이 자리는 두 길의 차이를 **화면마다 판단하게 하지 않는다** — 판단은 `run` 을
 * 넘겨주는 쪽이 한다.
 */
/** 이전에 받은 AI 결과 하나. 글과 말투를 함께 들고 있어야 되돌렸을 때 화면이 맞는다. */
export type DraftHistoryEntry = { text: string; variant: string; result: string };

/** 보관하는 이전 결과의 수. 많으면 고르는 일이 일이 된다. */
const HISTORY_MAX = 3;

export function useAiDraft({
  text,
  variant,
  initial,
  run,
  stream = false,
}: {
  /** 바꿀 원문. */
  text: string;
  /** 원문 말고 결과를 바꾸는 값(말투·모드). */
  variant: string;
  /** 서버가 미리 만들어 둔 첫 결과와, 그 결과가 나온 원문·변형. */
  initial: { text: string; variant: string; result: string };
  /**
   * 결과와 **그 결과를 누가 만들었는지** 를 함께 돌려줘야 한다. 예전에는 `Promise<string>`
   * 이라서 화면이 출처를 알아낼 방법이 없었고, 그 여백에서 예시가 AI 결과인 척했다.
   *
   * 세 번째 인자 `onDelta` 를 **받으면** 조각이 올 때마다 불린다. 스트리밍을 켠 도구는
   * `stream: true` 를 함께 켜야 "누르는 중" 글자가 화면에 오른다.
   */
  run: (
    text: string,
    variant: string,
    onDelta?: (partial: string) => void,
  ) => Promise<{ value: string; source: AiAnswerSource }>;
  /** 이 도구가 조각으로 온다 — `true` 면 만드는 중에도 글자가 보인다. */
  stream?: boolean;
}): {
  result: string;
  /** 만드는 중일 때 **이미 도착한 글**. 스트리밍이 아니면 빈 문자열. */
  partial: string;
  working: boolean;
  error: string | null;
  source: DraftSource;
  /** 지금 누르면 결과가 나오는가. 비어 있으면 거절한다. */
  canRun: boolean;
  /** 마지막으로 만든 뒤 손댄 것이 있는가(누르면 다시 만들어야 함). */
  stale: boolean;
  run: () => void;
  /**
   * **같은 글·같은 말투로 다시 만든다.** 평소에는 이미 있는 답이라 부르지 않지만, 마음에 안 들면
   * 사람이 일부러 한 번 더 받을 수 있어야 한다. **한도는 새로 1회 깎인다** — 화면이 그 사실을
   * 버튼 곁에 알린다.
   */
  redo: () => void;
  /** 지금 \"다시 만들기\" 를 누를 수 있는가(만든 결과가 있고, 글이 그대로이며, 만드는 중이 아님). */
  canRedo: boolean;
  /**
   * 직전까지의 **AI 결과**(최신순, 최대 3건). 예시는 넣지 않는다 — 모델이 만든 것이 아닌 글을
   * "이전 결과" 로 되돌리면 출처 약속이 흐려진다. **이 화면이 열려 있는 동안만** 있다 —
   * 글은 서버에도 브라우저 저장소에도 남기지 않는다(`AiUsage`/`AiCall` 과 같은 약속).
   */
  history: DraftHistoryEntry[];
  /** 이전 결과를 다시 화면에 올린다. 모델을 부르지 않으므로 한도가 깎이지 않는다. */
  restore: (index: number) => void;
} {
  const [result, setResult] = useState(initial.result);
  // 화면을 열자마자 보여 주는 것은 예시다. 키가 있어도 마찬가지 — 이건 모델이 만든 게 아니다.
  const [source, setSource] = useState<DraftSource>(initial.result ? "sample" : "none");
  // 이 결과를 어떤 원문·말투로 만들었는지. 같은 값이면 다시 부르지 않는다.
  const [made, setMade] = useState<{ text: string; variant: string } | null>(
    initial.result ? { text: initial.text, variant: initial.variant } : null,
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // **만드는 중 도착한 글.** 끝나면 비운다 — 남으면 다음 호출이 새 결과를 받기 전까지
  // 옛 글자를 보여 준다(결과가 두 개처럼 보인다).
  const [partial, setPartial] = useState("");
  const [history, setHistory] = useState<DraftHistoryEntry[]>([]);

  const trimmed = text.trim();
  const empty = trimmed.length === 0;
  // 서버가 준 예시와 손댄 것이 같으면 이미 답이 있다 — 같은 값으로 다시 부르지 않는다.
  const sameAsMade = made !== null && made.text === trimmed && made.variant === variant;
  const stale = !empty && !sameAsMade;

  const execute = useCallback(
    (force: boolean) => {
      if (empty || working || (sameAsMade && !force)) return;
      setWorking(true);
      setError(null);
      setPartial("");

      run(trimmed, variant, stream ? setPartial : undefined)
        .then(({ value, source: made_by }) => {
          // 바꾸기 전 결과가 **AI 가 만든 것이면** 이전 결과로 남긴다. 같은 글이 또 오면 쌓지 않는다.
          if (source === "ai" && made && result && result !== value) {
            const previous: DraftHistoryEntry = { text: made.text, variant: made.variant, result };
            setHistory((list) =>
              [previous, ...list.filter((entry) => entry.result !== previous.result)].slice(0, HISTORY_MAX),
            );
          }
          setResult(value);
          // 화면이 판단하지 않는다 — 서버가 함께 보낸 값을 그대로 쓴다.
          setSource(made_by);
          setMade({ text: trimmed, variant });
        })
        .catch((cause: unknown) => {
          // 실패한 호출의 한도 처리는 서버가 정한다(`ai/limit.ts`). 화면은 말만 전한다.
          setError(cause instanceof Error ? cause.message : "AI 응답을 받지 못했습니다.");
        })
        .finally(() => {
          setWorking(false);
          // 조각은 **결과가 정해졌을 때만** 치운다. 먼저 치우면 마지막 조각이 화면에서 사라졌다가
          // 완성값으로 다시 나타나 화면이 두 번 그린다.
          setPartial("");
        });
    },
    [empty, working, sameAsMade, run, stream, trimmed, variant, source, made, result],
  );

  const start = useCallback(() => execute(false), [execute]);
  const redo = useCallback(() => execute(true), [execute]);

  const restore = useCallback(
    (index: number) => {
      const entry = history[index];
      if (!entry || working) return;
      // 되돌린 결과는 AI 가 만든 것이다(역사에는 AI 결과만 있다). 지금 결과는 그 자리로 밀려난다.
      setHistory((list) => {
        const rest = list.filter((_, i) => i !== index);
        const current: DraftHistoryEntry | null =
          source === "ai" && made && result ? { text: made.text, variant: made.variant, result } : null;
        return (current ? [current, ...rest] : rest).slice(0, HISTORY_MAX);
      });
      setResult(entry.result);
      setSource("ai");
      setMade({ text: entry.text, variant: entry.variant });
      setError(null);
    },
    [history, working, source, made, result],
  );

  // 원문이 비었을 때의 화면은 상태가 아니라 계산이다 — 효과 안에서 비우면 렌더가 한 번 더
  // 돌고, "비웠다가 다시 채우는" 중간 상태가 보인다.
  return {
    result: empty ? "" : result,
    partial: empty || !working ? "" : partial,
    working: empty ? false : working,
    error: empty ? null : error,
    source: empty ? "none" : source,
    canRun: !empty && !working && !sameAsMade,
    stale: empty ? false : stale,
    run: start,
    redo,
    canRedo: !empty && !working && sameAsMade,
    history: empty ? [] : history,
    restore,
  };
}
