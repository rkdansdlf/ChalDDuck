"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  Dock,
  Icon,
  Note,
  Panel,
  Rows,
  SecTitle,
  Sheet,
  Textarea,
  Toast,
  Undecided,
} from "@/components/ui";
import type { Member, TeamCheckRecord } from "@/lib/types";
import { confirmContribRecord, disputeContribRecord } from "@/server/actions/contrib";
import { StepRail } from "./step-rail";

/**
 * 17 기여도 · 팀원 확인.
 *
 * 핵심: **의견이 다른 항목은 한쪽 말로 덮지 않고 둘 다 남긴다.** 기록이 한 사람의 주장으로
 * 정리돼 버리면, 정정을 요구한 사람은 기록을 신뢰할 수 없게 된다.
 */
export function ContribTeamScreen({
  records,
  roster,
}: {
  records: TeamCheckRecord[];
  roster: Member[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [disputing, setDisputing] = useState<TeamCheckRecord | null>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const confirm = async (record: TeamCheckRecord) => {
    if (working) return;
    setWorking(true);
    try {
      const result = await confirmContribRecord(record.id);
      router.refresh();
      flash(
        result === "ok"
          ? `${record.who}님의 기록을 확인했습니다`
          : result === "already"
            ? "이미 확인한 기록입니다"
            : result === "mine"
              ? "자기 기록은 확인할 수 없습니다"
              : "의견 차이가 정리된 뒤에 확인할 수 있습니다",
      );
    } finally {
      setWorking(false);
    }
  };

  const submitDispute = async () => {
    if (!disputing || !reason.trim() || working) return;
    setWorking(true);
    try {
      const result = await disputeContribRecord(disputing.id, reason);
      setDisputing(null);
      setReason("");
      router.refresh();
      flash(
        result === "ok"
          ? "적은 의견이 기록에 남았습니다"
          : result === "taken"
            ? "이미 다른 의견이 걸려 있습니다"
            : "자기 기록에는 적을 수 없습니다",
      );
    } finally {
      setWorking(false);
    }
  };

  const confirmed = records.filter((r) => r.state === "ok").length;
  const disputed = records.filter((r) => r.state === "disputed");
  const mbtiOf = (name: string) => roster.find((m) => m.name === name)?.mbti ?? null;

  return (
    <>
      <AppBar
        title="팀원 확인"
        sub="3 / 4단계 · 정정 가능"
        onBack={() => router.push("/team/contrib")}
      />

      <Body dense>
        <StepRail at={2} />

        <Panel s="fill" pad={14} r={16} className="mb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex-none text-txt-muted">
              <Icon name="list-checks" size={17} />
            </span>
            <span className="keep-all min-w-0 flex-1 font-semibold text-[13.5px] leading-[1.5] text-txt">
              {records.length}건 중 {confirmed}건 확인 완료
            </span>
            {disputed.length > 0 ? (
              <Chip tone="err" icon="circle-alert">
                의견 차이 {disputed.length}
              </Chip>
            ) : null}
          </div>
        </Panel>

        <SecTitle note="확인되지 않은 항목은 리포트에서 따로 표시됩니다">팀 기록</SecTitle>
        <Rows className="mb-3.5">
          {records.map((record) => (
            <div key={record.id} className="min-h-[56px] px-[15px] py-[13px]">
              <div className="flex items-start gap-[11px]">
                <Avatar name={record.who} mbti={mbtiOf(record.who)} size={34} />

                <div className="min-w-0 flex-1">
                  <div className="text-pretty-keep font-medium text-[14.5px] leading-[1.5] text-txt-strong">
                    {record.title}
                  </div>
                  <div className="t-cap-strong mt-1 text-txt-muted">{record.who}</div>

                  <div className="mt-[7px] flex flex-wrap gap-[5px]">
                    {record.state === "ok" ? (
                      <Chip tone="ok" icon="check">
                        {record.by}
                      </Chip>
                    ) : record.state === "pending" ? (
                      <Chip tone="warn" icon="circle-dashed">
                        {record.by}
                      </Chip>
                    ) : (
                      <Chip tone="err" icon="circle-alert">
                        {record.by}
                      </Chip>
                    )}
                  </div>

                  {/* 자기 기록은 확인할 수도, 정정을 적을 수도 없다 — 본인 말만으로
                      확정되면 기록이 근거가 되지 못한다는 것이 이 절차의 전부다. */}
                  {!record.isMine && record.state !== "disputed" ? (
                    <div className="mt-[9px] flex flex-wrap gap-1.5">
                      {record.iConfirmed ? (
                        <Chip tone="ok" icon="check">
                          내가 확인함
                        </Chip>
                      ) : (
                        <Btn
                          size="sm"
                          icon="check"
                          disabled={working}
                          onClick={() => confirm(record)}
                        >
                          맞습니다 — 확인
                        </Btn>
                      )}
                      <Btn
                        size="sm"
                        v="ghost"
                        icon="pen-line"
                        disabled={working}
                        onClick={() => {
                          setReason("");
                          setDisputing(record);
                        }}
                      >
                        사실과 다릅니다
                      </Btn>
                    </div>
                  ) : null}

                  {record.dispute ? (
                    <div className="mt-[9px] rounded-xl bg-err-bg px-3 py-2.5">
                      <div className="t-cap-strong mb-[3px] font-bold text-[#8A3B31]">적힌 의견</div>
                      <div className="text-pretty-keep text-[13.5px] leading-[1.55] text-[#8A3B31]">
                        {record.dispute}
                      </div>
                      {/* 정리된 뒤에도 적힌 의견은 그대로 두고 결론을 아래에 덧붙인다 —
                          의견을 지우고 결론만 남기면 한쪽 말로 덮는 것이 된다. */}
                      {record.resolution ? (
                        <div className="mt-[9px] flex items-center gap-1.5 text-[#8A3B31]">
                          <Icon name="check" size={14} />
                          <span className="t-cap-strong">
                            이렇게 정리했습니다 · {record.resolution}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-[9px] flex flex-wrap gap-1.5">
                          <Btn
                            size="sm"
                            v="outline"
                            icon="messages-square"
                            onClick={() => router.push("/chat/dm")}
                          >
                            1:1 DM
                          </Btn>
                          <Btn
                            size="sm"
                            v="ghost"
                            icon="split"
                            onClick={() => router.push(`/team/contrib/resolve/${record.id}`)}
                          >
                            정정에 응답하기
                          </Btn>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </Rows>

        <Note tone="info" icon="pen-line" title="정정할 권리가 있습니다">
          팀원의 기록이 사실과 다르면 고쳐 달라고 적을 수 있습니다. 의견이 다른 항목은{" "}
          <b>한쪽 말로 덮지 않고</b> 둘 다 남깁니다.
        </Note>

        <Undecided>
          의견 차이가 끝까지 안 좁혀졌을 때 최종 기재 방식이 기획안에 없습니다. 지금은 양쪽 의견을 함께
          남기는 안입니다. <b>몇 명이 확인해야 확정인지</b>도 정해지지 않아 한 명으로 두었습니다 —
          전원으로 두면 한 사람이 답하지 않을 때 영영 확정되지 않습니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          iconRight="arrow-right"
          onClick={() => router.push("/team/contrib/report")}
        >
          리포트 미리 보기
        </Btn>
      </Dock>

      <Sheet
        open={disputing !== null}
        title="무엇이 다른가요"
        onClose={() => setDisputing(null)}
      >
        <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
          <b>{disputing?.title}</b> 에 대해 적습니다. 적은 의견은 <b>지워지지 않고</b> 정리된 뒤에도
          결론과 함께 남습니다.
        </p>
        <Textarea
          value={reason}
          onChange={setReason}
          minHeight={92}
          placeholder="예: 초안은 공동 작성이었고 분량 절반은 제가 썼습니다."
          aria-label="적을 의견"
        />
        <div className="mt-3.5 flex gap-2">
          <Btn full v="outline" disabled={working} onClick={() => setDisputing(null)}>
            취소
          </Btn>
          <Btn full disabled={working || !reason.trim()} onClick={submitDispute}>
            의견 남기기
          </Btn>
        </div>
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}
