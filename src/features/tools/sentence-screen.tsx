"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, Body, CompareCard, Textarea, Undecided } from "@/components/ui";
import { convertSentence, getSentenceSample } from "@/data/api";
import { cn } from "@/lib/cn";
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
}: {
  modes: SentenceMode[];
  initialMode: string;
  initialInput: string;
  initialOutput: string;
}) {
  const router = useRouter();

  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState(initialInput);
  const [result, setResult] = useState(initialOutput);

  // 모드를 바꾸면 그 모드의 예시 문장으로 갈아 끼운다 — 두 모드는 다루는 글이 아예 다르다.
  useEffect(() => {
    if (mode === initialMode) return;
    let cancelled = false;
    getSentenceSample(mode).then((sample) => {
      if (!cancelled) setText(sample);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, initialMode]);

  useEffect(() => {
    const trimmed = text.trim();
    let cancelled = false;

    const draft = trimmed ? convertSentence(trimmed, mode) : Promise.resolve("");
    draft.then((value) => {
      if (!cancelled) setResult(value);
    });

    // 타이핑 중 앞선 결과가 뒤늦게 도착해 최신 입력을 덮어쓰지 않도록 취소한다
    return () => {
      cancelled = true;
    };
  }, [text, mode]);

  return (
    <>
      <AppBar
        title="상황별 문장 변환"
        sub="쿠션 번역기와 다른 기능입니다"
        onBack={() => router.push("/tools")}
      />

      <Body dense>
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
              minHeight={100}
              placeholder="바꾸고 싶은 글을 적어 주세요"
              aria-label="바꿀 글"
            />
          }
          resultLabel="변환 결과"
          result={result || "—"}
        />

        <Undecided>
          이 두 모드가 쿠션 번역기와 같은 화면에 있어야 하는지, 별도 도구로 남는지가 기획안에 없어 별도
          화면으로 두었습니다.
        </Undecided>
      </Body>
    </>
  );
}
