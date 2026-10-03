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
// 양쪽 다 필요하다 — `ClerkCandidate`(2단계-a 의 출처 표시)와 `saveMeetingNote`(회의록 저장).
import type { AiAnswerSource, ClerkCandidate, ClerkDraft, Member } from "@/lib/types";
import { assigneeOrigin } from "@/lib/tool-assignee";
import { saveMeetingNote } from "@/server/actions/notes";

const STEP_LABELS = ["회의 내용 입력", "요약 · 할 일 후보", "업무에 반영"];

export type MeetingContext = {
  id: string;
  date: string | null;
  time: string | null;
  location: string | null;
  agenda: string | null;
  durationMinutes: number;
} | null;

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
  meeting,
}: {
  sample: string;
  roster: Member[];
  aiReady: boolean;
  meeting?: MeetingContext;
}) {
  const router = useRouter();
  const names = roster.map((m) => m.name);

  // 회의 연계 시 회의 정보가 포함된 초기 템플릿 생성
  const initialText = meeting
    ? `[회의 정보]
- 일시: ${meeting.date ?? "미정"} ${meeting.time ? `(${meeting.time})` : ""}
- 장소: ${meeting.location || "미정"}
- 안건: ${meeting.agenda || "정기 팀 회의"}
- 참석자: ${names.join(", ")}

[회의록 메모]
`
    : sample;

  const [step, setStep] = useState(0);
  const [raw, setRaw] = useState(initialText);
  const [draft, setDraft] = useState<ClerkDraft | null>(null);
  const [source, setSource] = useState<AiAnswerSource | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 업무로 반영할 후보. */
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  /** 사람이 확인·수정한 담당자. */
  const [assignees, setAssignees] = useState<Record<string, string | null>>({});
  /**
   * **사람이 건드린 후보**를 기억한다(2단계-a2 결정: 한 번 유지 + 출처 표시).
   *
   * 왜 기억해야 하나: 순환 버튼이 **같은 이름으로 돌아올 수 있다.** 그때 화면에 보이는 값은
   * AI 가 정한 값과 글자가 같아서 **구분이 사라진다.** 하지만 그 순간 담당자는 사람이 고른
   * 값이다 — **값이 같아도 누가 정했는지가 다르다.**
   *
   * 표시만 사라지고 배정은 유지된다. 표시를 지우면 "AI 가 정했습니다" 는 사실이 되고,
   * 그건 이 저장소가 없애온 사고다.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});

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
    // **사람이 건드렀다** — AI 출처 표시를 끈다. 값이 같아도 사람의 선택이다.
    setTouched((prev) => ({ ...prev, [id]: true }));
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

        {meeting ? (
          <Panel s="card" pad={12} r={14} className="mb-3.5 border-l-4 border-l-brand bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-[13.5px] text-txt-strong">
                <Icon name="calendar" size={15} className="text-brand" />
                <span>연계된 회의: {meeting.agenda || "정기 팀 회의"}</span>
              </div>
              <Chip tone="ok">
                {meeting.date ?? "날짜 미정"}
              </Chip>
            </div>
            <div className="mt-1 text-[12px] text-txt-muted">
              {meeting.time ? `${meeting.time} · ` : ""}{meeting.location ? `${meeting.location} · ` : ""}
              회의 내용 요약 시 회의록이 자동 아카이브됩니다.
            </div>
          </Panel>
        ) : null}

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
                          {/**
                           * **담당자가 왜 비었는지**를 한 줄로 밝힌다.
                           *
                           * 지우기 전에는 "AI 가 추측하지 않았다" 는 좋은 소식이었지만, 지운 뒤에는
                           * 사용자가 "AI 가 못 찾아서 지웠나, 원래 정하지 않았나" 를 알 수 없다.
                           * 둘은 **사람이 하는 일이 다르다**(찾아서 고르기 / 정하기). "담당자 정하기"
                           * 만으로는 구분되지 않는다.
                           */}
                          {assigneeReasonOf(candidate) ? (
                            <Chip tone="warn">{assigneeReasonOf(candidate)}</Chip>
                          ) : null}
                          {/**
                           * **AI 가 읽은 담당자임을 밝힌다.**
                           *
                           * a1 이후 이 칩은 명단에 실제 있는 이름을 보여 주므로 **결정한 것처럼
                           * 읽힌다.** 스크롤만 하는 사람은 구분하지 못한다 — 이 저장소가 이미 한 번
                           * 겪은 "담당자를 조용히 매달지 못하게 한다" 의 같은 모양이다.
                           *
                           * 그래서 **단계를 늘리지 않고 출처를 밝힌다.** 그리고 사람이 이 칩을
                           * 건드리면 **사라진다** — 그 순간부터는 사람이 고른 값이라 AI 출처가
                           * 아니다. 배정은 그대로 두고 **표시만** 뗀다.
                           */}
                          {assigneeOrigin({
                              modelName: candidate.assignee,
                              currentNow: assignee,
                              touched: touched[candidate.id] === true,
                              reason: candidate.assigneeReason,
                            }) === "ai" ? (
                            <Chip tone="n" icon="sparkles">
                              메모에서 읽은 담당자예요
                            </Chip>
                          ) : null}
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
              disabled={acceptedCount === 0 || working}
              onClick={async () => {
                setWorking(true);
                try {
                  // 1. 담당자는 사람이 확인한 값을 쓴다 — AI 가 추측한 값이 아니다.
                  await addTasksFromClerk(
                    candidates
                      .filter((c) => picked[c.id])
                      .map((c) => ({
                        title: c.title,
                        due: c.due,
                        assignee: assignees[c.id] ?? null,
                      })),
                  );

                  // 2. 회의록 및 요약본을 DB에 영구 보관 (아카이브)
                  await saveMeetingNote({
                    meetingId: meeting?.id ?? null,
                    title: meeting?.agenda || "정기 팀 회의록",
                    rawText: raw,
                    summary: draft.summary,
                    taskCount: acceptedCount,
                  });

                  setStep(2);
                  router.refresh();
                } catch (cause: unknown) {
                  setError(cause instanceof Error ? cause.message : "반영 중 오류가 발생했습니다.");
                } finally {
                  setWorking(false);
                }
              }}
            >
              선택한 {acceptedCount}건 업무로 반영 및 회의록 저장
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
                할 일 {acceptedCount}건이 업무 목록에 추가되고<br />회의록이 안전하게 보관되었습니다
              </div>
              <div className="keep-all mt-1.5 font-medium text-[13.5px] leading-[1.5] text-yellow-700">
                캘린더 및 회의 조율 화면에서 언제든 회의록을 다시 확인할 수 있습니다
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
            {meeting ? (
              <Btn
                full
                size="lg"
                v="outline"
                icon="calendar"
                className="mt-2"
                onClick={() => router.push("/schedule/calendar")}
              >
                팀 통합 캘린더로 이동
              </Btn>
            ) : null}
            <Btn full size="lg" v="outline" className="mt-2" onClick={() => router.push("/tools")}>
              AI 도구로 돌아가기
            </Btn>
          </div>
        ) : null}
      </Body>
    </>
  );
}

/**
 * 후보의 담당자가 **비었을 때 왜 비었는지** 한 줄.
 *
 * ## 왜 화면에 그대로 보여 주나
 *
 * 2단계-a 에서 모델이 적은 이름은 팀원 명단과 대조해 **지워진다.** 사용자는 그 이름을
 * 봤을 수도 있다 — 화면에서 지워졌을 뿐 입력으로는 남아 있다. **왜 지웠는지 말하지 않으면
 * "AI 가 실수했다" 고 오해하고, 사람이 같은 후보를 다시 고쳐 넣는다**(그때 매칭이 또 안 된다).
 *
 * | 사유 | 사람이 할 일 |
 * |---|---|
 * | `no-match` | **이름을 바꿔야 한다** — 명단에 없는 이름이었다 |
 * | `ambiguous` | **누군지 물어야 한다** — 같은 이름이 둘 이상이다 |
 * | `unset` | 정하면 된다 — 모델도 정하지 않았다 |
 *
 * `matched` 인데 비어 있는 경우는 **나올 수 없다**(있으면 이름이 남는다). 그래도 화면이
 * 조용해지지 않게 **기본값은 사람이 정하게 두고** 화면도 같은 말을 쓴다.
 *
 * ⚠️ **사유가 아예 없는 경우**(예시 결과 — 매칭을 시도하지 않음)는 아무것도 붙이지 않는다.
 * "이름을 못 찾았다" 고 말하면 **거짓말**이 된다.
 */
function assigneeReasonOf(candidate: ClerkCandidate): string | null {
  if (candidate.assignee) return null;
  if (candidate.assigneeReason === "no-match") return "이름이 명단에 없어 지웠어요";
  if (candidate.assigneeReason === "ambiguous") return "같은 이름이 둘이라 누구인지 물어봐야 해요";
  if (candidate.assigneeReason === "unset") return "담당자가 정해지지 않았어요";
  return null;
}
