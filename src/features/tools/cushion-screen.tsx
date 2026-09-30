"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  AppBar,
  Body,
  Btn,
  Note,
  Panel,
  Textarea,
  Toast,
  Undecided,
} from "@/components/ui";
import { sendChatMessage } from "@/server/actions/chat";
import { TEAM_THREAD_ID } from "@/lib/types";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import {
  clearCushionDraft,
  noCushionDraft,
  peekCushionDraft,
  subscribeCushionDraft,
} from "./cushion-handoff";
import { TonePicker } from "./tone-picker";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { runAiStream } from "./ai-stream-client";
import { useAiDraft } from "./use-ai-draft";
import { DraftSourceChip } from "./draft-source-chip";
import { useAiQuota } from "./use-ai-quota";
import { cn } from "@/lib/cn";
import type { CushionTone } from "@/lib/types";

/**
 * 15 쿠션 번역기.
 *
 * 핵심 약속: **요구하는 내용은 그대로 두고 말투만 바꾼다.** 부탁을 없애거나 마감을 늦춰
 * 적지 않는다 — 그러면 말은 부드러워져도 일이 굴러가지 않는다.
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
  // 단톡방에서 넘겨받은 글은 **스토어로 읽는다.** 서버 스냅샷이 `null` 이라 hydrate 때는
  // 서버가 그린 `sample` 으로 시작하고, hydrate 가 끝난 뒤 클라이언트 값(내 글)으로 다시
  // 그려진다 — 그래서 첫 화면이 어긋나지 않는다.
  //
  // 예전 주석은 "서버 렌더에는 늘 없으므로 첫 화면이 서로 어긋나지 않는다"였는데, 정반대다.
  // **서버가 모르는 값을 첫 렌더에 쓰는 것이 어긋남의 원인**이고, 그래서 `useState` 의
  // 초기값으로 읽지 않는다.
  const handedOff = useSyncExternalStore(subscribeCushionDraft, peekCushionDraft, noCushionDraft);
  // 사람이 직접 고친 값이 있으면 그게 우선이다 — 넘겨받은 글은 시작값일 뿐이다.
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? handedOff ?? sample;
  const setText = setTyped;
  const [tone, setTone] = useState(initialTone);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 넘겨받은 글은 **화면을 떠날 때** 치운다. 읽는 중에 지우면 원문이 예시 문장으로
  // 되돌아가 사용자가 적은 글을 잃어버린다. 모델은 자동으로 부르지 않는다
  // (`use-ai-draft` 의 규칙) — 결과는 `stale` 로 표시되고 누를 때만 새로 만든다.
  useEffect(() => clearCushionDraft, []);

  /**
   * 쿠션 번역기만 **조각으로** 받는다.
   *
   * 다듬는 문장은 짧아서 전체가 2~4초 안에 나온다. 그 2~4초 동안 화면이 "다듬는 중…" 만
   * 보여 주면 이 도구가 느린 것처럼 느껴진다 — 실제로는 빠르다. **글자가 조금씩 오는 것**이
   * 가장 값싼 개선이다.
   *
   * **반환값은 `rewriteWithCushion` 과 같은 `{ value, source }`** 다. 화면이 어느 길로
   * 불렀는지 알지 못하고, 출처 배지도 두 길에서 똑같이 붙는다 — 스트리밍이 "별도 기능"이 되면
   * 여기서부터 어긋난다.
   */
  const run = useCallback(
    (value: string, key: string, onDelta?: (partial: string) => void) =>
      runAiStream({ tool: "cushion", text: value, variant: key, onDelta }),
    [],
  );
  const { result, partial, working, error, source, canRun, stale, run: generate } = useAiDraft({
    text,
    variant: tone,
    initial: { text: sample, variant: initialTone, result: initialResult },
    run,
    stream: true,
  });
  const { left, perDay } = useAiQuota(aiReady);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  /**
   * 단톡방에 보내고 그 방으로 간다. 다듬은 말이면 `viaCushion` 표시가 남는다 —
   * 원문을 그대로 보낼 때는 남지 않는다(다듬지 않았으니까).
   */
  const sendToTeam = async (message: string, viaCushion: boolean) => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const sent = await sendChatMessage(TEAM_THREAD_ID, message, { viaCushion });
      if (sent.ok) {
        router.push("/chat/team");
        return;
      }
      flash("보내지 못했습니다. 2,000자 이하인지 확인해 주세요.");
    } catch {
      flash("보내지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
    }
    setSending(false);
  };

  return (
    <>
      <AppBar title="쿠션 번역기" sub="말투만 바꿉니다" onBack={() => router.push("/tools")} />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">하고 싶은 말</div>
        <Textarea
          limit={AI_INPUT_LIMIT}
          value={text}
          onChange={setText}
          minHeight={92}
          placeholder="팀원에게 하고 싶은 말을 그대로 적어 주세요"
          aria-label="하고 싶은 말"
        />

        <div className="t-cap-strong mt-3.5 mb-[7px] font-bold text-txt-muted">말투 고르기</div>
        <TonePicker tones={tones} value={tone} onChange={setTone} label="말투" className="mb-3.5" />

        {aiReady ? (
          <div className="mt-3.5 mb-3 flex flex-wrap items-center gap-2">
            <Btn
              full
              size="lg"
              icon="wand-sparkles"
              disabled={!canRun}
              onClick={generate}
            >
              {working ? "다듬는 중…" : stale ? "고친 말 다시 다듬기" : "쿠션어로 다듬기"}
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

        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="t-cap-strong font-bold text-txt-muted">바꾼 말</span>
          {/* 배지 글자를 여기서 정하지 않는다 — 서버가 값과 함께 보낸 출처를 그대로 그린다. */}
          <DraftSourceChip source={source === "none" ? null : source} working={working} />
        </div>
        <Panel s="coral" pad={14} r={16} className="mb-3 transition-all duration-300">
          <div
            className={cn(
              "text-pretty-keep text-[15px] leading-[1.65] text-[#8A3B29] transition-all duration-200",
              working && "animate-pulse-subtle opacity-70",
              !working && result && "animate-slide-up",
            )}
          >
            {working ? (
              partial ? (
                // **도착한 글만 보여 준다.** 스피너와 글자를 함께 놓으면 "만드는 중" 과
                // "다듬은 말" 이 한 화면에 두 개 있어, 아직 반도 안 된 글이 결과인 것처럼 보인다.
                partial
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="animate-spin text-coral-600">🪄</span>
                  쿠션어로 다듬는 중…
                </span>
              )
            ) : (
              result || "원문을 적으면 다듬은 말이 여기에 나옵니다."
            )}
          </div>
        </Panel>

        <Note tone="info" icon="equal" className="mb-3">
          요구하는 내용(마감·필요한 것)은 그대로 둡니다. <b>말투만</b> 바뀝니다. 부탁을 없애거나 마감을
          늦춰 적지 않습니다.
        </Note>

        <div className="flex flex-wrap gap-[7px]">
          <Btn
            size="sm"
            icon="send"
            disabled={!result || working || sending}
            onClick={() => sendToTeam(result, true)}
          >
            이대로 보내기
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
            고쳐서 보내기
          </Btn>
          <Btn
            size="sm"
            v="ghost"
            disabled={!text.trim() || sending}
            // 예전에는 빈 단톡방만 열고 원문은 두고 갔다.
            onClick={() => sendToTeam(text, false)}
          >
            원문으로 보내기
          </Btn>
        </div>

        <Undecided>
          말투 종류의 개수와 이름이 기획안에 없어 세 가지로 두었습니다. MBTI에 따라 기본 말투를 자동
          적용할지도 정해지지 않았습니다.
        </Undecided>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
