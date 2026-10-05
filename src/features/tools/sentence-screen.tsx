"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  CompareCard,
  Icon,
  Note,
  Textarea,
  Toast,
  type IconName,
} from "@/components/ui";
import { getSentenceSample } from "@/server/actions/ai";
import { sendChatMessage } from "@/server/actions/chat";
import { TEAM_THREAD_ID } from "@/lib/types";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { DraftActions } from "./draft-actions";
import { runAiStream } from "./ai-stream-client";
import { useAiDraft } from "./use-ai-draft";
import { useAiUsageToday } from "./use-ai-usage";
import { cn } from "@/lib/cn";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import type { SentenceMode } from "@/lib/types";

/**
 * 27 상황별 문장 변환.
 *
 * 쿠션 번역기(15)와 **다른 기능**이다. 쿠션 번역기는 같은 말의 말투를 바꾸고,
 * 이건 글의 형태 자체를 바꾼다 (길게 → 짧게, 요청 → 메일/공지).
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
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { used, readable } = useAiUsageToday(aiReady);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  /**
   * 모드를 바꾸면 그 모드의 예시 문장으로 갈아 끼운다 — 모드마다 다루는 글이 아예 다르다.
   *
   * **거절되면 모드를 되돌린다.**
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
   * 조각으로 받는다 — 실시간으로 완성되는 스트리밍 경험 제공.
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

  const copyResult = async () => {
    if (!result.trim()) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      flash("클립보드에 복사되었습니다!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      flash("복사하지 못했습니다.");
    }
  };

  const sendToTeamChat = async () => {
    if (!result.trim() || sending) return;
    setSending(true);
    try {
      const sent = await sendChatMessage(TEAM_THREAD_ID, result);
      if (sent.ok) {
        flash("단톡방으로 메시지를 보냈습니다!");
        setTimeout(() => {
          router.push("/chat/team");
        }, 800);
        return;
      }
      flash("단톡방 전송에 실패했습니다. 글자 수를 확인해 주세요.");
    } catch {
      flash("전송 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <AppBar
        title="상황별 문장 변환"
        sub="목적에 맞는 형식으로 정돈"
        onBack={() => router.push("/tools")}
      />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        {/* 1. 4대 상황 변환 모드 선택 그리드 */}
        <div className="mb-4">
          <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">변환 상황 선택</div>
          <div role="radiogroup" aria-label="변환 모드" className="grid grid-cols-2 gap-2">
            {modes.map((item) => {
              const on = mode === item.key;
              const iconName = (item.icon as IconName) || "file-text";
              return (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMode(item.key)}
                  className={cn(
                    "min-h-[64px] cursor-pointer rounded-control p-2.5 text-left transition-all",
                    on
                      ? "border border-transparent bg-action text-on-action shadow-xs"
                      : "border border-line bg-card text-txt-strong hover:bg-surface-hover",
                  )}
                >
                  <span className="keep-all flex items-center gap-1.5 font-bold text-[13.5px] leading-[1.3]">
                    <Icon name={iconName} size={15} />
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      "keep-all mt-1 block font-medium text-[11px] leading-[1.35]",
                      on ? "opacity-90 text-white/90" : "text-txt-muted",
                    )}
                  >
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. 실행 버튼 및 호출 횟수 */}
        {aiReady ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Btn full size="lg" icon="wand-sparkles" disabled={!canRun} onClick={generate}>
              {working ? "바꾸는 중…" : stale ? "고친 글 다시 바꾸기" : "이 상황으로 바꾸기"}
            </Btn>
            {readable ? (
              <span className="t-cap w-full text-txt-muted">오늘 내가 {used}번 바꿨어요</span>
            ) : null}
          </div>
        ) : null}

        {/* 3. 원문 vs 결과 비교 카드 */}
        <CompareCard
          inputLabel="바꿀 글"
          editableInput
          input={
            <Textarea
              value={text}
              onChange={setText}
              limit={AI_INPUT_LIMIT}
              minHeight={110}
              placeholder="바꾸고 싶은 글을 적어 주세요"
              aria-label="바꿀 글"
            />
          }
          resultLabel="변환 결과"
          result={
            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  "whitespace-pre-wrap text-[15px] leading-[1.65]",
                  working && partial && "after:content-['▍'] after:animate-pulse after:ml-0.5 after:text-coral-600",
                )}
              >
                {working
                  ? partial || "바꾸는 중…"
                  : result || "바꿀 글을 적고 버튼을 누르면 여기에 나옵니다."}
              </div>
              {result ? (
                <div className="mt-2 flex items-center justify-between border-t border-[rgba(235,94,85,0.18)] pt-2.5">
                  <span className="text-[12px] font-medium text-[#8A3B29]/80">
                    {mode === "email" ? "교수님 메일 형식" : "변환 완료"}
                  </span>
                  <button
                    type="button"
                    onClick={copyResult}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-bold text-[#8A3B29] shadow-2xs transition-all hover:bg-white active:scale-95"
                    aria-label="결과 복사"
                  >
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? "복사됨!" : "결과 복사"}
                  </button>
                </div>
              ) : null}
            </div>
          }
          resultSource={source === "none" ? null : source}
        />

        {/* 4. 단톡방 전송 & 결과 복사 액션 바 */}
        {result ? (
          <div className="mb-4 flex flex-wrap gap-2 animate-slide-up">
            {mode !== "email" ? (
              <Btn
                icon="send"
                disabled={!result || working || sending}
                onClick={sendToTeamChat}
                className="flex-1"
              >
                {sending ? "단톡방 전송 중…" : "단톡방으로 바로 보내기"}
              </Btn>
            ) : null}
            <Btn
              v={mode === "email" ? "primary" : "outline"}
              icon={copied ? "check" : "copy"}
              disabled={!result || working}
              onClick={copyResult}
              className={mode === "email" ? "w-full" : "flex-initial"}
            >
              {copied ? "복사되었습니다" : "메일 내용 복사하기"}
            </Btn>
          </div>
        ) : null}

        {/* 5. 히스토리 되돌리기 */}
        {aiReady ? (
          <DraftActions
            className="mb-3"
            canRedo={canRedo}
            onRedo={redo}
            history={history}
            onRestore={restore}
            used={used}
          />
        ) : null}

        <Note tone="info" icon="equal" className="mb-3">
          원문의 핵심 요구와 기한·약속은 바꾸지 않고, <b>상황에 맞는 형식과 어투로만</b> 정돈합니다.
        </Note>

        {sampleError ? (
          <Note tone="err" icon="circle-alert" className="mb-3">
            {sampleError}
          </Note>
        ) : null}
      </Body>

      <Toast msg={toast} />
    </>
  );
}
