"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  CompareCard,
  Icon,
  Note,
  Rows,
  SecTitle,
  Textarea,
} from "@/components/ui";
import { refineScript } from "@/server/actions/ai";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { readAi } from "./ai-result";
import type { AiAnswerSource, PresentDraft } from "@/lib/types";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";

/**
 * 26 발표 지원.
 *
 * **내용을 새로 지어내지 않는다.** 말이 짧아지도록 표현만 다듬는다 —
 * 발표자가 모르는 문장이 대본에 들어가면 질의응답에서 막힌다.
 */
export function PresentScreen({
  sample,
  initialDraft,
  aiReady,
}: {
  sample: string;
  initialDraft: PresentDraft;
  aiReady: boolean;
}) {
  const router = useRouter();

  const [raw, setRaw] = useState(sample);
  const [draft, setDraft] = useState(initialDraft);
  // 예전에는 이 값이 없었고, 화면이 `aiReady` 만 보고 짐작했다. 키가 있으면 예시가 "AI 가 다듬은
  // 대본" 으로 그대로 보였다 — 사용자의 원문과는 상관없는 글이었다.
  const [source, setSource] = useState<AiAnswerSource>("sample");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refine = async () => {
    if (!raw.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      const { value, source: made_by } = readAi(await refineScript(raw.trim()));
      setDraft(value);
      setSource(made_by);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "AI 응답을 받지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <AppBar title="발표 지원" sub="대본 다듬기 · 예상 질문" onBack={() => router.push("/tools")} />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        <CompareCard
          inputLabel="원래 대본"
          editableInput
          input={
            <Textarea
              limit={AI_INPUT_LIMIT}
              value={raw}
              onChange={setRaw}
              minHeight={120}
              placeholder="발표할 대본을 붙여넣어 주세요"
              aria-label="발표 대본"
            />
          }
          resultLabel="다듬은 대본"
          result={draft.refined}
          resultSource={source}
        />

        <Btn
          full
          icon="wand-sparkles"
          className="mb-4"
          disabled={!raw.trim() || working}
          onClick={refine}
        >
          {working ? "다듬는 중…" : "대본 다듬고 예상 질문 뽑기"}
        </Btn>

        <Note tone="info" icon="equal" className="mb-4">
          내용을 새로 만들지 않고, <b>말이 짧아지도록 표현만</b> 다듬습니다.
        </Note>

        <SecTitle note="발표 전에 미리 준비해 보세요">예상 질문 {draft.questions.length}개</SecTitle>
        <Rows>
          {draft.questions.map((question, i) => (
            <div key={i} className="flex min-h-12 items-start gap-2.5 px-[15px] py-[13px]">
              <span className="flex-none text-txt-faint">
                <Icon name="circle-help" size={16} />
              </span>
              <span className="text-pretty-keep font-medium text-[14px] leading-[1.55] text-txt-strong">
                {question}
              </span>
            </div>
          ))}
        </Rows>

        {/* 정책 확정:
            예상 질문은 자료에서 뽑는다 — 대본을 넣으면 표현을 다듬으면서 나올 만한 질문을 함께
            추출한다 (server/ai/tools.ts 의 발표 지원). 목록에서 고르는 방식은 없다. */}
      </Body>
    </>
  );
}
