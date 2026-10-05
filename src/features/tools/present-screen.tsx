"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  CompareCard,
  Icon,
  Note,
  Rows,
  SecTitle,
  Textarea,
} from "@/components/ui";
import { refineScript } from "@/server/actions/ai";
import { shareQuestionsToChat } from "@/server/actions/chat";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { readAi } from "./ai-result";
import type {
  AiAnswerSource,
  PresentDraft,
  PresentMode,
  PresentQuestion,
  QuestionCategory,
} from "@/lib/types";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import { getSpeechPacingInfo } from "@/lib/present-pacing";
import { cn } from "@/lib/cn";

/** 발표 지원 정제 모드 메타데이터 */
const PRESENT_MODES: {
  key: PresentMode;
  name: string;
  desc: string;
  icon: "book-open" | "messages-square" | "clock";
}[] = [
  {
    key: "academic",
    name: "학술·정중형",
    desc: "교수님 평가 및 보고서용 격식체",
    icon: "book-open",
  },
  {
    key: "conversational",
    name: "청중 소통형",
    desc: "학우 공감 및 전달력 높은 구어체",
    icon: "messages-square",
  },
  {
    key: "concise",
    name: "시간 엄수형",
    desc: "군더더기 없는 핵심 결론 전달형",
    icon: "clock",
  },
];

/** 질문 카테고리 칩 메타데이터 */
const CATEGORY_MAP: Record<
  QuestionCategory,
  {
    label: string;
    tone: "y" | "ok" | "err" | "n";
    icon: "scale" | "search" | "presentation" | "circle-help";
  }
> = {
  data: { label: "데이터 근거", tone: "y", icon: "scale" },
  method: { label: "방법론", tone: "ok", icon: "search" },
  practical: { label: "실효성·한계", tone: "err", icon: "presentation" },
  general: { label: "일반", tone: "n", icon: "circle-help" },
};

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

  const [mode, setMode] = useState<PresentMode>(initialDraft.mode ?? "academic");
  const [raw, setRaw] = useState(sample);
  const [draft, setDraft] = useState(initialDraft);
  const [source, setSource] = useState<AiAnswerSource>("sample");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAllQ, setCopiedAllQ] = useState(false);
  const [copiedQId, setCopiedQId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  // 실시간 발화 소요 시간 계산
  const rawPacing = useMemo(() => getSpeechPacingInfo(raw), [raw]);
  const refinedPacing = useMemo(() => getSpeechPacingInfo(draft.refined), [draft.refined]);

  // 표시할 구조화된 질문 목록
  const questionsToDisplay: PresentQuestion[] = useMemo(() => {
    if (draft.structuredQuestions && draft.structuredQuestions.length > 0) {
      return draft.structuredQuestions;
    }
    return draft.questions.map((q, idx) => ({
      id: `q-${idx + 1}`,
      question: q,
      category: "general" as QuestionCategory,
    }));
  }, [draft.structuredQuestions, draft.questions]);

  const refine = async () => {
    if (!raw.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      const { value, source: made_by } = readAi(await refineScript(raw.trim(), mode));
      setDraft(value);
      setSource(made_by);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "AI 응답을 받지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const copyRefined = async () => {
    if (!draft.refined.trim()) return;
    try {
      await navigator.clipboard.writeText(draft.refined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 복사 실패 시 무시
    }
  };

  const copySingleQuestion = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedQId(id);
      setTimeout(() => setCopiedQId(null), 1800);
    } catch {
      // 무시
    }
  };

  const copyAllQuestions = async () => {
    if (questionsToDisplay.length === 0) return;
    const text = questionsToDisplay
      .map((q, idx) => `${idx + 1}. ${q.question}${q.intent ? ` (${q.intent})` : ""}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAllQ(true);
      setTimeout(() => setCopiedAllQ(false), 2000);
    } catch {
      // 무시
    }
  };

  const handleShareToChat = async () => {
    if (questionsToDisplay.length === 0 || sharing) return;
    setSharing(true);
    setShareSuccess(null);
    setError(null);
    try {
      const modeObj = PRESENT_MODES.find((m) => m.key === mode);
      const res = await shareQuestionsToChat({
        modeName: modeObj?.name,
        questions: questionsToDisplay.map((q) => ({
          question: q.question,
          intent: q.intent,
          category: q.category,
        })),
      });
      if (res.ok) {
        setShareSuccess("단톡방에 예상 질문 목록을 공유했습니다!");
        setTimeout(() => setShareSuccess(null), 3500);
      } else {
        setError(res.error);
      }
    } catch {
      setError("단톡방 공유 중 오류가 발생했습니다.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <AppBar title="발표 지원" sub="대본 다듬기 · 예상 질문" onBack={() => router.push("/tools")} />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        {/* 1. 발표 모드 선택기 */}
        <div role="radiogroup" aria-label="발표 모드 선택" className="mb-4 flex gap-1.5">
          {PRESENT_MODES.map((item) => {
            const on = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(item.key)}
                className={cn(
                  "min-h-[56px] flex-1 cursor-pointer rounded-control px-3 py-2.5 text-left transition-colors",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt-strong hover:bg-surface-hover",
                )}
              >
                <span className="keep-all flex items-center gap-1.5 font-bold text-[13.5px] leading-[1.3]">
                  <Icon name={item.icon} size={15} />
                  {item.name}
                </span>
                <span className="keep-all mt-0.5 block font-medium text-[11.5px] leading-[1.4] opacity-80">
                  {item.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* 2. 원래 대본 vs 다듬은 대본 비교 카드 */}
        <CompareCard
          inputLabel={`원래 대본 (${rawPacing.chars.toLocaleString()}자 · ${rawPacing.formatted})`}
          editableInput
          input={
            <div>
              <Textarea
                limit={AI_INPUT_LIMIT}
                value={raw}
                onChange={setRaw}
                minHeight={120}
                placeholder="발표할 대본을 붙여넣어 주세요"
                aria-label="발표 대본"
              />
              <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[12px] text-txt-muted">
                <Icon name="clock" size={13} />
                <span>
                  예상 발표 시간: <strong className="font-semibold text-txt-sub">{rawPacing.formatted}</strong>
                </span>
                <span className="text-txt-faint">({rawPacing.syllables.toLocaleString()}음절)</span>
              </div>
            </div>
          }
          resultLabel={`다듬은 대본 (${refinedPacing.chars.toLocaleString()}자 · ${refinedPacing.formatted})`}
          result={
            <div className="flex flex-col gap-2.5">
              <div className="whitespace-pre-wrap">{draft.refined}</div>
              {draft.refined ? (
                <div className="flex items-center justify-between border-t border-[rgba(235,94,85,0.18)] pt-2.5">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#8A3B29]/85">
                    <Icon name="clock" size={13} />
                    <span>
                      예상 발표: <strong className="font-semibold text-[#8A3B29]">{refinedPacing.formatted}</strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={copyRefined}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-bold text-[#8A3B29] shadow-2xs transition-all hover:bg-white active:scale-95"
                    aria-label="다듬은 대본 복사"
                  >
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? "대본 복사됨!" : "대본 복사"}
                  </button>
                </div>
              ) : null}
            </div>
          }
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
          내용을 새로 만들지 않고, <b>말이 짧아지도록 표현만</b> 다듬습니다. 예상 질문의 답변은 AI가 대신 쓰지 않고 팀원과 함께 준비하도록 돕습니다.
        </Note>

        {/* 3. 예상 질문 섹션 (의도 태깅 및 팀 협업 연계) */}
        <div className="mt-6 mb-2">
          <SecTitle
            note="발표 전에 미리 팀원들과 상의해 보세요"
            action={copiedAllQ ? "전체 복사됨" : "전체 복사"}
            onAction={copyAllQuestions}
          >
            예상 질문 {questionsToDisplay.length}개
          </SecTitle>
        </div>

        {shareSuccess ? (
          <div className="mb-3 flex items-center gap-2 rounded-control bg-ok-bg px-3 py-2 text-[13px] font-medium text-[#2F5F52] animate-slide-up">
            <Icon name="check" size={15} />
            <span>{shareSuccess}</span>
          </div>
        ) : null}

        <Rows className="mb-3">
          {questionsToDisplay.map((item) => {
            const cat = CATEGORY_MAP[item.category ?? "general"] ?? CATEGORY_MAP.general;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-1.5 border-b border-line px-[15px] py-[13px] last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={cat.tone} icon={cat.icon}>
                      {cat.label}
                    </Chip>
                    {item.intent ? (
                      <span className="text-[12px] font-medium text-txt-muted">
                        · {item.intent}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const qParam = encodeURIComponent(item.intent || item.question);
                        router.push(`/tools/researcher?q=${qParam}`);
                      }}
                      className="flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-txt-faint transition-colors hover:text-link"
                      title="AI 리서처에서 근거 자료 검색"
                    >
                      <Icon name="search" size={13} />
                      <span>근거 찾기</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copySingleQuestion(item.question, item.id)}
                      className="flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-txt-faint transition-colors hover:text-txt-sub"
                      aria-label="질문 복사"
                    >
                      <Icon name={copiedQId === item.id ? "check" : "copy"} size={13} />
                      <span>{copiedQId === item.id ? "복사됨" : "복사"}</span>
                    </button>
                  </div>
                </div>
                <span className="text-pretty-keep font-medium text-[14.5px] leading-[1.55] text-txt-strong">
                  {item.question}
                </span>
              </div>
            );
          })}
        </Rows>

        {/* 4. 팀 단톡방 Q&A 공유 액션 바 */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Btn
            v="outline"
            icon="share-2"
            disabled={sharing || questionsToDisplay.length === 0}
            onClick={handleShareToChat}
            className="flex-1"
          >
            {sharing ? "단톡방 공유 중…" : "팀과 Q&A 준비하기 (단톡방 공유)"}
          </Btn>
        </div>

        {/* 정책 확정:
            예상 질문은 자료에서 뽑는다 — 대본을 넣으면 표현을 다듬으면서 나올 만한 질문을 함께
            추출한다 (server/ai/tools.ts 의 발표 지원). 목록에서 고르는 방식은 없다. */}
      </Body>
    </>
  );
}
