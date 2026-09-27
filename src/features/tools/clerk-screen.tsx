"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Icon,
  Note,
  Panel,
  Progress,
  SecTitle,
  Textarea,
  Undecided,
} from "@/components/ui";
import { summarizeMeeting } from "@/server/actions/ai";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { readAi } from "./ai-result";
import { DraftSourceChip } from "./draft-source-chip";
import { addTasksFromClerk } from "@/server/actions/tasks";
import { cn } from "@/lib/cn";
import { AI_INPUT_LIMIT, aiInputOverrun } from "@/lib/ai-limit";
import type { AiAnswerSource, ClerkDraft, Member } from "@/lib/types";

const STEP_LABELS = ["회의 내용 입력", "요약 · 할 일 후보", "업무에 반영"];

/**
 * 20 AI 서기.
 *
 * 세 단계: 회의 내용 입력 → 요약·할 일 후보 → 업무에 반영.
 *
 * **AI 는 후보만 뽑는다.** 담당자와 기한은 사람이 확인해야 반영된다 —
 * 회의에서 정해지지 않은 담당자를 AI 가 임의로 채우면 아무도 책임지지 않는 업무가 생긴다.
 */
export function ClerkScreen({
  sample,
  roster,
  aiReady,
}: {
  sample: string;
  roster: Member[];
  aiReady: boolean;
}) {
  const router = useRouter();
  const names = roster.map((m) => m.name);

  const [step, setStep] = useState(0);
  const [raw, setRaw] = useState(sample);
  const [draft, setDraft] = useState<ClerkDraft | null>(null);
  const [source, setSource] = useState<AiAnswerSource | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 업무로 반영할 후보. */
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  /** 사람이 확인·수정한 담당자. */
  const [assignees, setAssignees] = useState<Record<string, string | null>>({});

  const candidates = draft?.candidates ?? [];
  const acceptedCount = candidates.filter((c) => picked[c.id]).length;

  const extract = async () => {
    if (!raw.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      const { value: result, source: made_by } = readAi(await summarizeMeeting(raw.trim()));
      setSource(made_by);
      setDraft(result);
      setPicked(Object.fromEntries(result.candidates.map((c) => [c.id, true])));
      setAssignees(Object.fromEntries(result.candidates.map((c) => [c.id, c.assignee])));
      setStep(1);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "AI 응답을 받지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  /** 담당자를 팀원 목록 순서대로 돌린다. */
  const cycleAssignee = (id: string) => {
    setAssignees((prev) => {
      const current = prev[id];
      const index = current ? names.indexOf(current) : -1;
      return { ...prev, [id]: names[(index + 1) % names.length] };
    });
  };

  return (
    <>
      <AppBar
        title="AI 서기"
        sub={STEP_LABELS[step]}
        onBack={() => (step === 0 ? router.push("/tools") : setStep(step - 1))}
      />

      <Body dense>
        <Progress step={step + 1} total={3} label="AI 서기 진행 단계" className="mb-4" />

        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        {step === 0 ? (
          <>
            <div className="t-label mb-1.5 text-txt-strong">회의 내용</div>
            <Textarea
              value={raw}
              onChange={setRaw}
              limit={AI_INPUT_LIMIT}
              placeholder="회의 중 적은 메모나 채팅 로그를 그대로 붙여넣으면 됩니다."
              aria-label="회의 내용"
            />
            <div className="t-cap text-pretty-keep mt-1.5 mb-3.5 text-txt-muted">
              회의 중 적은 메모나 채팅 로그를 그대로 붙여넣으면 됩니다.
              {/* 잘린다는 사실을 숨기지 않는다 — 예전에는 서버만 8000자에서 잘랐고 화면에는
                  아무 표시가 없어, 회의 절반이 빠진 요약이 "전부"인 것처럼 보였다. */}
              {aiInputOverrun(raw) > 0 ? (
                <>
                  {" "}
                  <b className="text-err">
                    {aiInputOverrun(raw).toLocaleString("ko-KR")}자가 잘립니다 — AI 는 앞부분만
                    봅니다.
                  </b>
                </>
              ) : null}
            </div>

            <Note tone="info" icon="shield" className="mb-3.5">
              AI는 이 내용에서 <b>할 일 후보만 뽑습니다</b>. 실제 업무 목록에 반영하려면 다음 단계에서
              직접 확인해야 합니다.
            </Note>

            <Btn full size="lg" icon="wand-sparkles" disabled={!raw.trim() || working} onClick={extract}>
              {working ? "뽑는 중…" : "회의 내용에서 할 일 뽑기"}
            </Btn>
          </>
        ) : null}

        {step === 1 && draft ? (
          <div className="animate-slide-up">
            <SecTitle note="AI가 뽑은 초안입니다 · 그대로 반영되지 않습니다">회의 요약</SecTitle>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="t-cap-strong font-bold text-txt-muted">요약</span>
              {/* 이 자리는 예전부터 무조건 "AI 초안" 이었다. 키가 없으면 서버가 예시를 돌려주고,
                  그 예시가 회의 요약으로 놓였다. 서버가 보내온 출처를 그대로 쓴다. */}
              <DraftSourceChip source={source} working={working} />
            </div>
            <Panel s="coral" pad={14} r={16} className="mb-4">
              <div className="text-pretty-keep text-[14.5px] leading-[1.6] text-[#8A3B29]">
                {draft.summary}
              </div>
            </Panel>

            <SecTitle note="담당자·기한을 확인하고 필요 없으면 빼세요">
              할 일 후보 {candidates.length}건
            </SecTitle>
            <div className="mb-3.5 flex flex-col gap-2">
              {candidates.map((candidate) => {
                const on = picked[candidate.id];
                const assignee = assignees[candidate.id];
                return (
                  <Panel
                    key={candidate.id}
                    s={on ? "card" : "fill"}
                    pad={14}
                    r={16}
                    className={cn("transition-all duration-150", on ? undefined : "opacity-55")}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${candidate.title} 반영하기`}
                        onClick={() => setPicked((p) => ({ ...p, [candidate.id]: !p[candidate.id] }))}
                        className={cn(
                          "mt-px grid size-6 flex-none cursor-pointer place-items-center rounded-lg text-ink-900 select-none transition-all duration-150 active:scale-75",
                          on
                            ? "border-[1.5px] border-transparent bg-yellow-400 scale-105"
                            : "border-[1.5px] border-line-strong bg-card",
                        )}
                      >
                        {on ? (
                          <span className="animate-pop inline-flex">
                            <Icon name="check" size={15} />
                          </span>
                        ) : null}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="keep-all font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                          {candidate.title}
                        </div>
                        <div className="keep-all mt-[3px] text-[12.5px] leading-[1.5] text-txt-muted">
                          {candidate.basis}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => cycleAssignee(candidate.id)}
                            aria-label={`${candidate.title} 담당자 바꾸기`}
                            className="cursor-pointer border-none bg-transparent p-0"
                          >
                            <Chip icon="user-round" tone={assignee ? "n" : "warn"}>
                              {assignee ?? "담당자 정하기"}
                            </Chip>
                          </button>
                          <Chip icon="calendar-clock">{candidate.due}</Chip>
                        </div>
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>

            <Undecided>
              회의 내용을 텍스트로 직접 붙여넣는 방식 외에 음성 녹음 인식 여부는 기획안에 없어 다루지
              않았습니다.
            </Undecided>

            <Btn
              full
              size="lg"
              icon="list-checks"
              className="mt-3.5"
              disabled={acceptedCount === 0}
              onClick={async () => {
                // 담당자는 사람이 확인한 값을 쓴다 — AI 가 추측한 값이 아니다.
                await addTasksFromClerk(
                  candidates
                    .filter((c) => picked[c.id])
                    .map((c) => ({
                      title: c.title,
                      due: c.due,
                      assignee: assignees[c.id] ?? null,
                    })),
                );
                setStep(2);
                router.refresh();
              }}
            >
              선택한 {acceptedCount}건 업무로 반영하기
            </Btn>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="animate-pop">
            <Panel s="yellow" pad={20} className="mb-4 text-center">
              <div
                className="mb-2.5 inline-flex size-[52px] items-center justify-center rounded-full text-yellow-700 animate-jelly"
                style={{ background: "rgba(255,255,255,.75)" }}
              >
                <Icon name="check" size={24} />
              </div>
              <div className="keep-all font-extrabold text-[18px] leading-[1.35] text-ink-900">
                할 일 {acceptedCount}건이 업무 목록에 추가됐습니다
              </div>
              <div className="keep-all mt-1.5 font-medium text-[13.5px] leading-[1.5] text-yellow-700">
                담당자에게 별도로 수락을 요청하세요
              </div>
            </Panel>

            <Btn
              full
              size="lg"
              iconRight="arrow-right"
              onClick={() => router.push("/home/tasks")}
            >
              할 일 · 체크리스트에서 보기
            </Btn>
            <Btn full size="lg" v="outline" className="mt-2" onClick={() => router.push("/tools")}>
              AI 도구로 돌아가기
            </Btn>
          </div>
        ) : null}
      </Body>
    </>
  );
}
