"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, Note, Panel, SecTitle, Sheet } from "@/components/ui";
import type { TeamSaju } from "@/data/api";
import {
  MEETING_ATTENDEE_WORD,
  MEETING_CHEMISTRY_NOTICE,
  MEETING_FLOW_CLEARED,
  MEETING_FLOW_COPIED,
  MEETING_FLOW_COPY_FAILED,
  MEETING_FLOW_NOT_CONFIRMED,
  MEETING_FLOW_SAVED,
  MEETING_FLOW_SAVED_NOTE,
  MEETING_FLOW_SAVE_CAPTION,
  MEETING_FLOW_SAVE_FAILED,
  MEETING_TIP,
  TEAM_NEED_MINE,
} from "@/lib/saju/copy";
import { ELEMENTS, ELEMENT_KO } from "@/lib/saju/engine";
import { meetingFlowText, planMeetingFlow } from "@/lib/saju/meeting-flow";
import { summarizeTeam } from "@/lib/saju/team";
import { clearMeetingFlow, saveMeetingFlow } from "@/server/actions/meeting-flow";
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
 * 진행 방식을 넣으면 제목이 길어진다. 그래서 전용 칸(`MeetingProposal.flow`)에 **저장**하거나 **복사**한다.
 *
 * ## 저장하는 글과 복사하는 글은 다르다
 *
 * 복사하는 글에는 "가장 적게 센 오행" 제안이 들어가고, 저장하는 글에는 **들어가지 않는다.** 저장한 글은
 * 사주를 등록하지 않은 팀원도 보기 때문이다. 저장하는 글은 서버가 회의 길이로 만든다(여기서 보내지 않는다).
 */
export function MeetingChemistrySheet({
  open,
  meetingId,
  durationMinutes,
  savedFlow,
  onClose,
}: {
  open: boolean;
  meetingId: string | null;
  durationMinutes: number;
  /** 이 회의에 이미 저장된 진행 방식. 없으면 `null`. */
  savedFlow: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ id: string | null; data: TeamSaju | null }>({ id: null, data: null });
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  /** 저장하거나 지운다. 결과는 말로 알리고, 회의 카드가 새 값을 그리도록 화면을 다시 읽는다. */
  const toggleSaved = async () => {
    if (!meetingId) return;
    setSaving(true);
    try {
      const res = savedFlow ? await clearMeetingFlow(meetingId) : await saveMeetingFlow(meetingId);
      if (res === "ok") {
        setCopyNote(savedFlow ? MEETING_FLOW_CLEARED : MEETING_FLOW_SAVED);
        router.refresh();
      } else {
        setCopyNote(res === "not-confirmed" ? MEETING_FLOW_NOT_CONFIRMED : MEETING_FLOW_SAVE_FAILED);
      }
    } catch {
      setCopyNote(MEETING_FLOW_SAVE_FAILED);
    } finally {
      setSaving(false);
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
          <div className="flex flex-col gap-2">
            {savedFlow ? <p className="t-cap-strong m-0 text-center text-txt-muted">{MEETING_FLOW_SAVED_NOTE}</p> : null}
            {/* 채운 버튼은 하나 — 아직 저장하지 않았다면 저장이 주 동작이고, 저장한 뒤에는 지우기·복사가 둘 다 보조다. */}
            {savedFlow ? (
              <Btn full v="outline" disabled={saving} onClick={toggleSaved}>
                저장된 진행 방식 지우기
              </Btn>
            ) : (
              <Btn full disabled={saving} onClick={toggleSaved}>
                {saving ? "저장 중…" : "회의에 저장하기"}
              </Btn>
            )}
            <Btn full v="outline" onClick={copy}>
              진행 방식 복사하기
            </Btn>
            {copyNote ? (
              <p role="status" className="t-cap m-0 text-center text-txt-muted">
                {copyNote}
              </p>
            ) : (
              <p className="t-cap m-0 text-center text-txt-muted">{MEETING_FLOW_SAVE_CAPTION}</p>
            )}
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
