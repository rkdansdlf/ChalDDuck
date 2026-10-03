"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppBar, Body, Btn, CompareCard, Note, Textarea, Undecided } from "@/components/ui";
import { getSentenceSample } from "@/server/actions/ai";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { DraftActions } from "./draft-actions";
import { runAiStream } from "./ai-stream-client";
import { useAiDraft } from "./use-ai-draft";
import { useAiQuota } from "./use-ai-quota";
import { cn } from "@/lib/cn";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import type { SentenceMode } from "@/lib/types";

/**
 * 27 상황별 문장 변환.
 *
 * 쿠션 번역기(15)와 **다른 기능**이다. 쿠션 번역기는 같은 말의 말투를 바꾸고,
 * 이건 글의 형태 자체를 바꾼다(길게 → 짧게, 반말 질문 → 격식 있는 메일).
 */
export function SentenceScreen({
  modes,
  initialMode,
  initialInput,
  initialOutput,
  aiReady,
}: {
  modes: SentenceMode[];
  initialMode: string;
  initialInput: string;
  initialOutput: string;
  aiReady: boolean;
}) {
  const router = useRouter();

  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState(initialInput);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const { left, perDay } = useAiQuota(aiReady);

  /**
   * 모드를 바꾸면 그 모드의 예시 문장으로 갈아 끼운다 — 두 모드는 다루는 글이 아예 다르다.
   *
   * **거절되면 모드를 되돌린다.** 예전에는 `catch` 가 없어 모드는 이미 바뀌었는데 글은
   * 옛 모드의 것이 남아 있었다. 그 상태로 AI 를 부르면 "교수님께 드릴 메일" 요청을
   * 핵심 요약으로 돌려받는다 — 잘못된 모드의 글로 잘못된 결과가 나오는데 아무 말도 없다.
   */
  useEffect(() => {
    if (mode === initialMode) return;
    let cancelled = false;
    getSentenceSample(mode)
      .then((sample) => {
        if (cancelled) return;
        setText(sample);
        setSampleError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setMode(initialMode);
        setSampleError("다른 방식으로 바꾸지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, initialMode]);

  /**
   * 조각으로 받는다 — **요약 모드에서 특히 그렇다.**
   *
   * 요약은 끝까지 빈 화면이었다가 한 번에 차는 게 가장 답답하다. 요약은 **늘어나는** 것이
   * 보이는데 그것이 한 번에 일어나면 기다리는 시간이 길게 느껴지고, 사용자는 두 번째로
   * 눌러버린다(그때 또 한도가 깎인다).
   *
   * 반환값은 `convertSentence` 와 같은 `{ value, source }` — 스트리밍이 별도 계약이 되지
   * 않게 하는 것이 목적이다.
   */
  const run = useCallback(
    (value: string, key: string, onDelta?: (partial: string) => void) =>
      runAiStream({ tool: "sentence", text: value, variant: key, onDelta }),
    [],
  );
  const {
    result,
    partial,
    working,
    error,
    source,
    canRun,
    stale,
    run: generate,
    redo,
    canRedo,
    history,
    restore,
  } = useAiDraft({
    text,
    variant: mode,
    initial: { text: initialInput, variant: initialMode, result: initialOutput },
    run,
    stream: true,
  });

  return (
    <>
      <AppBar
        title="상황별 문장 변환"
        sub="쿠션 번역기와 다른 기능입니다"
        onBack={() => router.push("/tools")}
      />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        {aiReady ? (
          <div className="mt-3 mb-3 flex flex-wrap items-center gap-2">
            <Btn full size="lg" icon="wand-sparkles" disabled={!canRun} onClick={generate}>
              {working ? "바꾸는 중…" : stale ? "고친 글 다시 바꾸기" : "이 상황으로 바꾸기"}
            </Btn>
            {/* 한도를 미리 보여 준다 — 막혀서야 알게 하지 않는다. */}
            {perDay > 0 ? (
              <span className="t-cap w-full text-txt-muted">
                오늘 내 몫 {left}회 남음
                {left === 0 ? " — 다 썼습니다" : ""}
              </span>
            ) : null}
          </div>
        ) : null}

        <div role="radiogroup" aria-label="변환 모드" className="mb-4 flex gap-1.5">
          {modes.map((item) => {
            const on = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(item.key)}
                className={cn(
                  "min-h-[56px] flex-1 cursor-pointer rounded-control px-3 py-2.5 text-left",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt-strong",
                )}
              >
                <span className="keep-all block font-bold text-[13.5px] leading-[1.3]">
                  {item.name}
                </span>
                <span className="keep-all mt-0.5 block font-medium text-[11.5px] leading-[1.4] opacity-80">
                  {item.desc}
                </span>
              </button>
            );
          })}
        </div>

        <CompareCard
          inputLabel="바꿀 글"
          editableInput
          input={
            <Textarea
              value={text}
              onChange={setText}
              limit={AI_INPUT_LIMIT}
              minHeight={100}
              placeholder="바꾸고 싶은 글을 적어 주세요"
              aria-label="바꿀 글"
            />
          }
          resultLabel="변환 결과"
          result={working ? partial || "바꾸는 중…" : result || "—"}
          resultSource={source === "none" ? null : source}
        />

        {aiReady ? (
          <DraftActions
            className="mt-3 mb-3"
            canRedo={canRedo}
            onRedo={redo}
            history={history}
            onRestore={restore}
            left={left}
            limited={perDay > 0}
          />
        ) : null}

        {sampleError ? (
          <Note tone="err" icon="circle-alert" className="mb-3">
            {sampleError}
          </Note>
        ) : null}

        <Undecided>
          이 두 모드가 쿠션 번역기와 같은 화면에 있어야 하는지, 별도 도구로 남는지가 기획안에 없어 별도
          화면으로 두었습니다.
        </Undecided>
      </Body>
    </>
  );
}
