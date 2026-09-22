"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Note,
  Panel,
  Textarea,
  Toast,
  Undecided,
} from "@/components/ui";
import { rewriteWithCushion } from "@/server/actions/ai";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { unwrapAi } from "./ai-result";
import { useAiDraft } from "./use-ai-draft";
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
  const [text, setText] = useState(sample);
  const [tone, setTone] = useState(initialTone);
  const [toast, setToast] = useState<string | null>(null);

  // 말투를 바꾸거나 원문을 고치면 결과를 다시 받는다 — 입력이 멎은 뒤 한 번만.
  const run = useCallback(
    (value: string, key: string) => rewriteWithCushion(value, key).then(unwrapAi),
    [],
  );
  const { result, working, error } = useAiDraft({
    text,
    variant: tone,
    initial: { text: sample, variant: initialTone, result: initialResult },
    run,
  });

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  return (
    <>
      <AppBar title="쿠션 번역기" sub="말투만 바꿉니다" onBack={() => router.push("/tools")} />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">하고 싶은 말</div>
        <Textarea
          value={text}
          onChange={setText}
          minHeight={92}
          placeholder="팀원에게 하고 싶은 말을 그대로 적어 주세요"
          aria-label="하고 싶은 말"
        />

        <div className="t-cap-strong mt-3.5 mb-[7px] font-bold text-txt-muted">말투 고르기</div>
        <div role="radiogroup" aria-label="말투" className="mb-3.5 flex gap-1.5 overflow-x-auto">
          {tones.map((item) => {
            const on = tone === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTone(item.key)}
                className={cn(
                  "min-h-11 flex-none cursor-pointer whitespace-nowrap rounded-xl px-3.5 font-bold text-[13.5px] leading-none",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt",
                )}
              >
                {item.name}
              </button>
            );
          })}
        </div>

        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="t-cap-strong font-bold text-txt-muted">바꾼 말</span>
          <Chip tone="y" icon="sparkles">
            AI 초안
          </Chip>
        </div>
        <Panel s="coral" pad={14} r={16} className="mb-3">
          <div className="text-pretty-keep text-[15px] leading-[1.65] text-[#8A3B29]">
            {working ? "다듬는 중…" : result || "원문을 적으면 다듬은 말이 여기에 나옵니다."}
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
            disabled={!result}
            // TODO(19 단톡방): 다듬은 말을 들고 대화방으로 넘어가 바로 보내야 한다.
            onClick={() => flash("다듬은 말을 단톡방으로 보내는 연결은 준비 중입니다")}
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
          <Btn size="sm" v="ghost" onClick={() => router.push("/chat/team")}>
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
