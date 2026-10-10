"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AppBar,
  Body,
  Btn,
  Icon,
  Textarea,
  Toast,
} from "@/components/ui";
import { sendChatMessage } from "@/server/actions/chat";
import { TEAM_THREAD_ID } from "@/lib/types";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import {
  clearCushionDraft,
  handOffToComposer,
  noCushionDraft,
  peekCushionDraft,
  peekCushionMeta,
  subscribeCushionDraft,
} from "./cushion-handoff";
import { TonePicker } from "./tone-picker";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { runAiStream } from "./ai-stream-client";
import { useAiDraft } from "./use-ai-draft";
import { DraftActions } from "./draft-actions";
import { useAiUsageToday } from "./use-ai-usage";
import { analyzeCushionChanges } from "./cushion-analysis";
import { cn } from "@/lib/cn";
import type { CushionTone } from "@/lib/types";

/**
 * 15 쿠션 번역기.
 *
 * 핵심 원칙:
 * "할 말은 그대로, 말투만 바꿔드려요."
 *
 * 요구하는 내용(무엇이 필요한지·마감 기한)은 그대로 유지하고,
 * 상대방에게 닿는 말투만 부드럽고 명확하게 다듬어 팀원 간 불필요한 감정 소모를 줄입니다.
 */
export function CushionScreen({
  tones,
  sample,
  initialResult,
  aiReady,
}: {
  tones: CushionTone[];
  sample: string;
  /** 서버가 미리 준 첫 결과. 화면을 열자마자 호출이 나가지 않게 한다. */
  initialResult: string;
  aiReady: boolean;
}) {
  const router = useRouter();

  const initialTone = tones[0]?.key ?? "soft";
  const handedOff = useSyncExternalStore(subscribeCushionDraft, peekCushionDraft, noCushionDraft);
  // 마운트 시점의 출처 메타데이터를 보관한다 (clear 되더라도 이 화면이 떠 있는 동안 유지).
  const [handoffMeta] = useState(() => peekCushionMeta());
  const returnPath = handoffMeta?.returnTo ?? "/tools";

  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? handedOff ?? sample;
  const setText = setTyped;
  const [tone, setTone] = useState(initialTone);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => clearCushionDraft, []);

  const run = useCallback(
    (value: string, key: string, onDelta?: (partial: string) => void) =>
      runAiStream({ tool: "cushion", text: value, variant: key, onDelta }),
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
    variant: tone,
    initial: { text: sample, variant: initialTone, result: initialResult },
    run,
    stream: true,
  });

  const { used } = useAiUsageToday(aiReady);

  const currentToneObj = tones.find((t) => t.key === tone);
  const toneName = currentToneObj?.name ?? "부드럽게";

  // 신뢰 검증: 원문 대비 보존된 내용 및 변경된 표현 분석
  const diffAnalysis = useMemo(() => {
    return analyzeCushionChanges(text, result, tone);
  }, [text, result, tone]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  /**
   * 단톡방에 메시지를 보내고 팀 채팅으로 이동합니다.
   */
  const sendToTeam = async (message: string, viaCushion: boolean) => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const sent = await sendChatMessage(TEAM_THREAD_ID, message, { viaCushion });
      if (sent.ok) {
        router.push("/chat/team?from=cushion-sent");
        return;
      }
      flash("보내지 못했습니다. 2,000자 이하인지 확인해 주세요.");
    } catch {
      flash("보내지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
    }
    setSending(false);
  };

  const hasInput = text.trim().length > 0;

  // 메인 '쿠션어로 다듬기' 버튼 클릭 핸들러
  const handleMainGenerate = () => {
    if (working || !hasInput) return;
    if (canRun) {
      generate();
    } else {
      redo();
    }
  };

  const subTitle =
    handoffMeta?.source === "chat"
      ? "단톡방에서 작성 중이던 글을 다듬고 있어요"
      : handoffMeta?.source === "poke"
        ? "진행상황 요청 메시지를 다듬고 있어요"
        : "할 말은 그대로, 말투만 바꿔드려요";

  return (
    <>
      <AppBar
        title="쿠션 번역기"
        sub={subTitle}
        onBack={() => router.push(returnPath)}
      />

      <Body dense>
        {/* 맥락 출처 안내 배너 */}
        {handoffMeta?.source === "chat" ? (
          <div className="mb-3.5 flex items-center justify-between rounded-xl border border-yellow-200/90 bg-yellow-50/80 px-3 py-2 text-[12.5px] text-yellow-900 shadow-2xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Icon name="messages-square" size={14} className="text-yellow-700" />
              단톡방에서 가져온 글을 다듬는 중입니다
            </span>
            <button
              type="button"
              onClick={() => router.push("/chat/team")}
              className="cursor-pointer font-bold text-yellow-800 underline hover:text-yellow-950"
            >
              단톡방으로 복귀
            </button>
          </div>
        ) : handoffMeta?.source === "poke" ? (
          <div className="mb-3.5 flex items-center justify-between rounded-xl border border-yellow-200/90 bg-yellow-50/80 px-3 py-2 text-[12.5px] text-yellow-900 shadow-2xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Icon name="bell" size={14} className="text-yellow-700" />
              진행상황 요청(콕 찌르기) 메시지입니다
            </span>
            <button
              type="button"
              onClick={() => router.push("/home/tasks")}
              className="cursor-pointer font-bold text-yellow-800 underline hover:text-yellow-950"
            >
              업무 목록으로
            </button>
          </div>
        ) : null}

        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        {/* 1. 하고 싶은 말 (원문 입력) */}
        <div className="mb-3.5">
          <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">하고 싶은 말</div>
          <Textarea
            limit={AI_INPUT_LIMIT}
            value={text}
            onChange={setText}
            minHeight={64}
            autoResize
            placeholder="팀원에게 하고 싶은 말을 그대로 적어 주세요"
            aria-label="하고 싶은 말"
          />
        </div>

        {/* 2. 말투 고르기 */}
        <div className="mb-3">
          <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">말투 고르기</div>
          <TonePicker tones={tones} value={tone} onChange={setTone} label="말투" />
        </div>

        {/* 3. 쿠션어로 다듬기 버튼 (강한 시각적 대비 & 명확한 활성 상태) */}
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
                  <span>쿠션어로 다듬는 중…</span>
                </>
              ) : (
                <>
                  <span className="text-sm">✨</span>
                  <span>{stale ? "고친 말 다시 다듬기" : "쿠션어로 다듬기"}</span>
                </>
              )}
            </button>
          </div>
        ) : null}

        {/* 4. 다듬은 말 (결과 카드 & 신뢰 전후 비교 UX) */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="t-cap-strong font-bold text-txt-strong">다듬은 말</span>
              <span className="rounded-md bg-cr-100 px-1.5 py-0.5 text-[11px] font-semibold text-txt-muted">
                {toneName}
              </span>
            </div>
            {working ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-txt-muted">
                <span className="animate-spin text-xs">⏳</span> 다듬는 중
              </span>
            ) : result ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-ok">
                <Icon name="check" size={13} /> 완성
              </span>
            ) : null}
          </div>

          {/* 따뜻한 크림/화이트 계열의 완성 결과 카드 */}
          <div className="rounded-card border border-line-strong bg-card p-4 shadow-2xs transition-all duration-200">
            <div
              className={cn(
                "text-pretty-keep text-[15.5px] font-medium leading-[1.7] text-txt-strong transition-all duration-150",
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
                    <span>쿠션어로 다듬는 중…</span>
                  </span>
                )
              ) : (
                result || "원문을 적고 다듬기 버튼을 누르면 완성된 말이 여기에 나옵니다."
              )}
            </div>

            {/* 카드 하단 신뢰 안내 & 바뀐 표현 보기 토글 */}
            {result && !working ? (
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
                <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ok">
                  <Icon name="check" size={13} />
                  <span>{toneName} · 요청 내용과 마감은 유지했어요</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDiff((prev) => !prev)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold text-txt-muted transition-colors select-none hover:bg-cr-100 hover:text-txt-strong"
                  aria-expanded={showDiff}
                >
                  <span>{showDiff ? "바뀐 표현 접기" : "바뀐 표현 보기"}</span>
                  <Icon name={showDiff ? "chevron-up" : "chevron-down"} size={13} />
                </button>
              </div>
            ) : null}

            {/* 전후 비교 상세 뷰 (바뀐 표현 보기 펼침) */}
            {result && !working && showDiff ? (
              <div className="mt-3 rounded-xl border border-line bg-cr-50 p-3.5 text-[13px] animate-slide-up space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center gap-1 font-bold text-txt-strong">
                    <span className="text-ok">✓</span> 유지한 내용
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
                    <span className="text-action">✎</span> 바꾼 부분
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

        {/* 6. 하단 액션 위계 (단톡방에 바로 보내기 > 단톡방 입력창에 담기 > 직접 고치기 > 원문으로 보내기) */}
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            size="sm"
            icon="send"
            disabled={!result || working || sending}
            onClick={() => sendToTeam(result, true)}
          >
            {sending ? "보내는 중…" : "단톡방에 바로 보내기"}
          </Btn>
          <Btn
            size="sm"
            v="outline"
            icon="messages-square"
            disabled={!result || working}
            onClick={() => {
              handOffToComposer(result);
              router.push("/chat/team");
            }}
          >
            단톡방 입력창에 담기
          </Btn>
          <Btn
            size="sm"
            v="outline"
            icon="pencil"
            disabled={!result}
            onClick={() => {
              setText(result);
              flash("다듬은 말을 원문 칸으로 옮겼습니다 — 직접 고쳐 보세요");
            }}
          >
            직접 고치기
          </Btn>
          <button
            type="button"
            disabled={!hasInput || sending}
            onClick={() => sendToTeam(text, false)}
            className={cn(
              "inline-flex min-h-[38px] items-center justify-center gap-1 rounded-control px-3 py-2 select-none",
              "text-[13px] font-medium text-txt-muted transition-colors duration-150",
              "hover:bg-cr-100 hover:text-txt-strong active:scale-95",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-txt-muted cursor-pointer",
            )}
          >
            원문으로 보내기
          </button>
        </div>

        {/* 정책 확정: 말투는 3가지 프리셋('부드럽게', '담담하게', '분명하게')으로 표준화한다.
            사용자 의도와 맥락 보호를 위해 MBTI에 따른 강제 자동 변경 없이 기본값('부드럽게')을 유지한다. */}
      </Body>

      <Toast msg={toast} />
    </>
  );
}
