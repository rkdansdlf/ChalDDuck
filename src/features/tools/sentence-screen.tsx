"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
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
import { analyzeSentenceChanges } from "./sentence-analysis";
import { cn } from "@/lib/cn";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import type { SentenceMode } from "@/lib/types";

/**
 * 27 상황별 문장 변환.
 *
 * 목적:
 * 팀플 중 마주치는 특수한 상황(교수님 메일, 팀원 요청, 단톡 공지, 회의 요약)에 맞춰
 * 핵심 용건과 기한은 그대로 유지하면서, 목적에 최적화된 형식과 서식으로 정돈합니다.
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
  const [showDiff, setShowDiff] = useState(false);
  const { used } = useAiUsageToday(aiReady);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  /**
   * 모드를 바꾸면 그 모드의 예시 문장으로 전환합니다.
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
   * AI 스트리밍 실행.
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

  const currentModeObj = modes.find((m) => m.key === mode);
  const modeName = currentModeObj?.name ?? "선택한 모드";

  // 신뢰 검증: 모드별 전후 보존 항목 및 서식 정돈 분석
  const diffAnalysis = useMemo(() => {
    return analyzeSentenceChanges(text, result, mode);
  }, [text, result, mode]);

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

  const hasInput = text.trim().length > 0;

  const handleMainGenerate = () => {
    if (working || !hasInput) return;
    if (canRun) {
      generate();
    } else {
      redo();
    }
  };

  // 모드별 상태 설명 문구
  const modeStatusText =
    mode === "email"
      ? "교수님 메일 서식 적용 완료"
      : mode === "peer_request"
        ? "정중한 요청 어조 적용 완료"
        : mode === "notice"
          ? "단톡방 공지 서식화 완료"
          : "핵심 결정사항 요약 완료";

  return (
    <>
      <AppBar
        title="상황별 문장 변환"
        sub="원하는 상황에 딱 맞게 정돈해 드려요"
        onBack={() => router.push("/tools")}
      />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        {/* 1. 바꿀 글 (원문 입력) */}
        <div className="mb-3.5">
          <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">바꿀 글</div>
          <Textarea
            value={text}
            onChange={setText}
            limit={AI_INPUT_LIMIT}
            minHeight={64}
            autoResize
            placeholder="상황에 맞게 바꾸고 싶은 글을 적어 주세요"
            aria-label="바꿀 글"
          />
        </div>

        {/* 2. 4대 상황 변환 모드 선택 그리드 */}
        <div className="mb-3">
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
                    "min-h-[64px] cursor-pointer rounded-control p-2.5 text-left transition-all duration-150 select-none active:scale-[0.985]",
                    on
                      ? "border border-transparent bg-action text-on-action shadow-xs"
                      : "border border-line bg-card text-txt-strong hover:bg-cr-50",
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

        {/* 3. 상황에 맞게 바꾸기 실행 버튼 (선명한 대비 & shimmer) */}
        {aiReady ? (
          <div className="mb-4">
            <button
              type="button"
              disabled={!hasInput || working}
              onClick={handleMainGenerate}
              className={cn(
                "relative inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-control px-4 py-3 select-none",
                "text-[15px] font-bold transition-all duration-150 ease-out",
                !hasInput
                  ? "cursor-not-allowed border border-line bg-fill text-txt-disabled"
                  : working
                    ? "cursor-wait border-2 border-line-strong bg-cr-100 text-txt-muted overflow-hidden after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.4s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent"
                    : "cursor-pointer border-2 border-action bg-cr-25 text-action shadow-xs hover:bg-cr-50 hover:border-action-hover active:scale-[0.985]",
              )}
            >
              {working ? (
                <>
                  <span className="text-sm">✨</span>
                  <span>{modeName}(으)로 변환 중…</span>
                </>
              ) : (
                <>
                  <span className="text-sm">✨</span>
                  <span>{stale ? "고친 글 다시 변환하기" : `${modeName}으로 변환하기`}</span>
                </>
              )}
            </button>
          </div>
        ) : null}

        {/* 4. 변환 결과 카드 & 신뢰 전후 비교 UX */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="t-cap-strong font-bold text-txt-strong">변환 결과</span>
              <span className="rounded-md bg-cr-100 px-1.5 py-0.5 text-[11px] font-semibold text-txt-muted">
                {modeName}
              </span>
            </div>
            {working ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-txt-muted">
                <span className="animate-spin text-xs">⏳</span> 변환 중
              </span>
            ) : result ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-ok">
                  <Icon name="check" size={13} /> 완성
                </span>
                <button
                  type="button"
                  onClick={copyResult}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-cr-100 px-2 py-0.5 text-[11.5px] font-bold text-txt-strong transition-colors hover:bg-cr-200 active:scale-95"
                  aria-label="결과 복사"
                >
                  <Icon name={copied ? "check" : "copy"} size={12} />
                  <span>{copied ? "복사됨!" : "복사"}</span>
                </button>
              </div>
            ) : null}
          </div>

          {/* 따뜻한 크림/화이트 계열의 완성 결과 카드 */}
          <div className="rounded-card border border-line-strong bg-card p-4 shadow-2xs transition-all duration-200">
            <div
              className={cn(
                "text-pretty-keep whitespace-pre-wrap text-[15px] font-medium leading-[1.7] text-txt-strong transition-all duration-150",
                working && partial && "after:content-['▍'] after:animate-pulse after:ml-0.5 after:text-action",
                !working && result && "animate-slide-up",
              )}
            >
              {working ? (
                partial ? (
                  partial
                ) : (
                  <span className="inline-flex items-center gap-2 text-txt-muted">
                    <span className="animate-wiggle text-base">🪄</span>
                    <span>{modeName}(으)로 변환 중…</span>
                  </span>
                )
              ) : (
                result || "바꿀 글을 적고 변환 버튼을 누르면 완성된 글이 여기에 나옵니다."
              )}
            </div>

            {/* 카드 하단 신뢰 안내 & 어떻게 정돈되었는지 보기 토글 */}
            {result && !working ? (
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
                <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ok">
                  <Icon name="check" size={13} />
                  <span>{modeStatusText}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDiff((prev) => !prev)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold text-txt-muted transition-colors select-none hover:bg-cr-100 hover:text-txt-strong"
                  aria-expanded={showDiff}
                >
                  <span>{showDiff ? "정돈 내용 접기" : "어떻게 정돈되었는지 보기"}</span>
                  <Icon name={showDiff ? "chevron-up" : "chevron-down"} size={13} />
                </button>
              </div>
            ) : null}

            {/* 전후 비교 상세 뷰 (어떻게 정돈되었는지 보기 펼침) */}
            {result && !working && showDiff ? (
              <div className="mt-3 rounded-xl border border-line bg-cr-50 p-3.5 text-[13px] animate-slide-up space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center gap-1 font-bold text-txt-strong">
                    <span className="text-ok">✓</span> 유지한 핵심 내용
                  </div>
                  <div className="rounded-lg border border-line-strong/60 bg-card px-3 py-2 text-[12.5px] leading-relaxed text-txt-strong">
                    {diffAnalysis.preserved.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className="size-1.5 flex-none rounded-full bg-ok" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center gap-1 font-bold text-txt-strong">
                    <span className="text-action">✎</span> 정돈된 서식 및 어조
                  </div>
                  <div className="rounded-lg border border-line-strong/60 bg-card px-3 py-2 text-[12.5px] space-y-1.5">
                    {diffAnalysis.changes.map((change, idx) => (
                      <div key={idx} className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-err line-through decoration-err/50">
                            {change.original}
                          </span>
                          <span className="text-txt-faint">→</span>
                          <span className="font-bold text-ok">
                            {change.changed}
                          </span>
                        </div>
                        {change.reason ? (
                          <div className="text-[11.5px] text-txt-muted">
                            {change.reason}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 5. 재생성 및 통합된 사용 횟수 UI */}
        {aiReady ? (
          <DraftActions
            className="mb-4"
            canRedo={canRedo}
            onRedo={redo}
            history={history}
            onRestore={restore}
            used={used}
            redoLabel="다른 표현으로 다시 만들기"
            usageLabel={`오늘 ${used}회 사용`}
          />
        ) : null}

        {/* 6. 모드별 최적화된 하단 액션 위계 */}
        {result ? (
          <div className="flex flex-wrap items-center gap-2">
            {mode === "email" ? (
              // 교수님 메일 모드: 메일 내용 복사하기가 최우선
              <>
                <Btn
                  size="sm"
                  v="primary"
                  icon="copy"
                  disabled={!result || working}
                  onClick={copyResult}
                >
                  {copied ? "복사되었습니다" : "메일 내용 복사하기"}
                </Btn>
                <Btn
                  size="sm"
                  v="outline"
                  icon="pencil"
                  disabled={!result}
                  onClick={() => {
                    setText(result);
                    flash("결과를 원문 칸으로 옮겼습니다 — 직접 고쳐 보세요");
                  }}
                >
                  직접 고쳐서 쓰기
                </Btn>
                <button
                  type="button"
                  disabled={!result || working || sending}
                  onClick={sendToTeamChat}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-control px-3 py-2 text-[13px] font-medium text-txt-muted transition-colors hover:bg-cr-100 hover:text-txt-strong disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-txt-muted cursor-pointer"
                >
                  단톡방으로 보내기
                </button>
              </>
            ) : mode === "summary" ? (
              // 핵심 요약 모드: 복사하기가 최우선
              <>
                <Btn
                  size="sm"
                  v="primary"
                  icon="copy"
                  disabled={!result || working}
                  onClick={copyResult}
                >
                  {copied ? "복사되었습니다" : "요약 내용 복사하기"}
                </Btn>
                <Btn
                  size="sm"
                  v="outline"
                  icon="send"
                  disabled={!result || working || sending}
                  onClick={sendToTeamChat}
                >
                  {sending ? "단톡방 전송 중…" : "단톡방으로 바로 보내기"}
                </Btn>
                <Btn
                  size="sm"
                  v="outline"
                  icon="pencil"
                  disabled={!result}
                  onClick={() => {
                    setText(result);
                    flash("결과를 원문 칸으로 옮겼습니다 — 직접 고쳐 보세요");
                  }}
                >
                  직접 고치기
                </Btn>
              </>
            ) : (
              // 팀원 요청 / 단톡 공지 모드: 단톡방 전송이 최우선
              <>
                <Btn
                  size="sm"
                  v="primary"
                  icon="send"
                  disabled={!result || working || sending}
                  onClick={sendToTeamChat}
                >
                  {sending ? "단톡방 전송 중…" : "단톡방으로 바로 보내기"}
                </Btn>
                <Btn
                  size="sm"
                  v="outline"
                  icon="copy"
                  disabled={!result || working}
                  onClick={copyResult}
                >
                  {copied ? "복사됨!" : "내용 복사하기"}
                </Btn>
                <Btn
                  size="sm"
                  v="outline"
                  icon="pencil"
                  disabled={!result}
                  onClick={() => {
                    setText(result);
                    flash("결과를 원문 칸으로 옮겼습니다 — 직접 고쳐 보세요");
                  }}
                >
                  직접 고쳐서 보내기
                </Btn>
              </>
            )}
          </div>
        ) : null}

        {sampleError ? (
          <Note tone="err" icon="circle-alert" className="mt-3">
            {sampleError}
          </Note>
        ) : null}
      </Body>

      <Toast msg={toast} />
    </>
  );
}
