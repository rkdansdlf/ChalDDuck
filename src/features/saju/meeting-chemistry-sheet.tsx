"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, Note, Panel, SecTitle, Sheet } from "@/components/ui";
import type { TeamSaju } from "@/data/api";
import {
  MEETING_ATTENDEE_WORD,
  MEETING_CHEMISTRY_NOTICE,
  MEETING_FLOW_COPIED,
  MEETING_FLOW_COPY_FAILED,
  MEETING_TIP,
  TEAM_NEED_MINE,
} from "@/lib/saju/copy";
import { ELEMENTS, ELEMENT_KO } from "@/lib/saju/engine";
import { meetingFlowText, planMeetingFlow } from "@/lib/saju/meeting-flow";
import { summarizeTeam } from "@/lib/saju/team";
import { getMeetingChemistry } from "@/server/actions/saju";
import { ElementBar } from "./element-bar";

/**
 * 회의 케미 — 확정된 회의의 **참석 예정자**로 본 팀 오행과 추천 진행 방식.
 *
 * 참석 예정은 서버가 정한다(`getMeetingSaju`: 참석 어려움으로 응답하지 않은 팀원). 여기서 사람을
 * 다시 거르지 않는다 — 화면이 거르면 서버가 내려보낸 값과 다른 사람을 세게 된다.
 *
 * 누가 어느 단계를 하라는 말이 없다. 사주로 사람의 역할을 정하지 않는다.
 * 안건(`agenda`)에는 쓰지 않는다 — 안건은 회의록 제목과 기여 기록 제목으로 그대로 쓰여서, 여기에
 * 진행 방식을 넣으면 제목이 길어진다. 그래서 **복사**만 한다.
 */
export function MeetingChemistrySheet({
  open,
  meetingId,
  durationMinutes,
  onClose,
}: {
  open: boolean;
  meetingId: string | null;
  durationMinutes: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ id: string | null; data: TeamSaju | null }>({ id: null, data: null });
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const loading = Boolean(open && meetingId && loaded.id !== meetingId);
  const data = open && meetingId && loaded.id === meetingId ? loaded.data : null;

  useEffect(() => {
    if (!open || !meetingId) return;
    let cancelled = false;
    getMeetingChemistry(meetingId)
      .then((res) => {
        if (!cancelled) setLoaded({ id: meetingId, data: res });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ id: meetingId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, meetingId]);

  const summary = data ? summarizeTeam(data.members) : null;
  const plan = planMeetingFlow(durationMinutes);
  const ready = Boolean(data && data.meRegistered && data.members.length >= 2 && summary);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meetingFlowText(plan, summary?.lowest ?? []));
      setCopyNote(MEETING_FLOW_COPIED);
    } catch {
      setCopyNote(MEETING_FLOW_COPY_FAILED);
    }
  };

  return (
    <Sheet
      open={open}
      title="회의 케미"
      onClose={() => {
        setCopyNote(null);
        onClose();
      }}
      footer={
        ready ? (
          <div>
            <Btn full onClick={copy}>
              진행 방식 복사하기
            </Btn>
            {copyNote ? (
              <p role="status" className="t-cap mt-1.5 mb-0 text-center text-txt-muted">
                {copyNote}
              </p>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <p className="text-pretty-keep m-0 mb-3.5 text-[13.5px] leading-[1.6] text-txt-muted">
        {MEETING_CHEMISTRY_NOTICE}
      </p>

      {loading ? (
        <p className="t-body py-8 text-center text-txt-muted">불러오는 중…</p>
      ) : !data ? (
        <Note tone="warn" icon="circle-alert">
          회의 케미를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.
        </Note>
      ) : !data.meRegistered ? (
        <Panel s="cream" pad={16}>
          <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">{TEAM_NEED_MINE}</p>
          <Btn full v="outline" onClick={() => router.push("/team/access")}>
            내 사주 등록하기
          </Btn>
        </Panel>
      ) : data.members.length < 2 || !summary ? (
        <Panel s="cream" pad={16}>
          <p className="text-pretty-keep m-0 text-[14.5px] leading-[1.6] text-txt">
            {MEETING_ATTENDEE_WORD} {data.activeCount}명 중 사주를 등록한 사람이 {data.registeredCount}명이에요. 두 명
            이상 등록하면 볼 수 있어요.
          </p>
        </Panel>
      ) : (
        <>
          <SecTitle note={`${MEETING_ATTENDEE_WORD} ${data.activeCount}명 중 ${data.registeredCount}명이 사주를 등록했어요`}>
            {MEETING_ATTENDEE_WORD}자 오행 분포
          </SecTitle>
          <Panel s="card" pad={16} className="mb-4 flex flex-col gap-2.5">
            {ELEMENTS.map((e) => (
              <ElementBar
                key={e}
                element={e}
                count={summary.counts[e]}
                percent={summary.percent[e]}
                top={summary.dominant.includes(e)}
              />
            ))}
          </Panel>

          <SecTitle note={`${plan.total}분 기준이에요`}>추천 진행</SecTitle>
          <Panel s="card" pad={16} className="mb-4 flex flex-col gap-3">
            {plan.steps.map((s) => (
              <div key={s.n}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold text-txt-strong">
                    {String(s.n).padStart(2, "0")} {s.title}
                  </span>
                  <span className="t-cap flex-none text-txt-muted">{s.minutes}분</span>
                </div>
                <p className="text-pretty-keep m-0 mt-0.5 text-[14px] leading-[1.55] text-txt">{s.desc}</p>
              </div>
            ))}
          </Panel>

          {summary.lowest.length > 0 ? (
            <>
              <SecTitle note="가장 적게 센 오행의 키워드를 일부러 챙겨 보는 제안이에요">챙겨 볼 것</SecTitle>
              <Panel s="card" pad={16} className="mb-2 flex flex-col gap-2.5">
                {summary.lowest.slice(0, 2).map((e) => (
                  <div key={e}>
                    <div className="t-cap-strong text-txt-muted">가장 적게 센 오행 · {ELEMENT_KO[e]}</div>
                    <p className="text-pretty-keep m-0 mt-0.5 text-[14.5px] leading-[1.6] text-txt">{MEETING_TIP[e]}</p>
                  </div>
                ))}
              </Panel>
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
