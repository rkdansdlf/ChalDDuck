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
import { useAction } from "@/lib/use-action";
import { confirmContribRecord, disputeContribRecord, pollContribCheck } from "@/server/actions/contrib";
import { usePoll } from "@/lib/use-poll";
import { EvidenceLink } from "./evidence-link";
import { StepRail } from "./step-rail";

/**
 * 17 기여도 · 팀원 확인.
 *
 * 핵심: **의견이 다른 항목은 한쪽 말로 덮지 않고 둘 다 남긴다.** 기록이 한 사람의 주장으로
 * 정리돼 버리면, 정정을 요구한 사람은 기록을 신뢰할 수 없게 된다.
 */
/** 함께 보고 있는 목록의 확인 주기. 확인·반박은 사람이 하므로 길게 둔다. */
const CONTRIB_POLL_MS = 20_000;

export function ContribTeamScreen({
  records,
  roster,
}: {
  records: TeamCheckRecord[];
  roster: Member[];
}) {
  const router = useRouter();
  const [disputing, setDisputing] = useState<TeamCheckRecord | null>(null);
  const [reason, setReason] = useState("");
  const { toast, busy, run } = useAction();
  const working = busy.act === true;

  /**
   * **이 화면도 저절로 따라온다.**
   *
   * 함께 보고 있는 목록인데 옆 사람이 확인하거나 반박해도 화면을 넘겨야만 보이면, 그 사이에
   * 무엇이 바뀌었는지 놓친다. 이 화면은 내가 "확인함"을 눌러도 갱신되지 않았다 — 그 조작
   * 옆에 있는 동료의 것까지 묶여 있었기 때문이다.
   *
   * 주기는 길게 둔다. 확인과 반박은 사람이 하는 일이라 몇 초 차이는 답답함보다 거슬림이 크다.
   * 내가 직접 한 조작의 결과는 `router.refresh()` 가 먼저 반영하므로, 폴링이 그 위에 덮어쓰지
   * 않는다(같은 행은 같은 내용이다).
   */
  /**
   * **이 화면도 저절로 따라온다.**
   *
   * 함께 보고 있는 목록인데 옆 사람이 확인하거나 반박해도 화면을 넘겨야만 보이면, 그 사이에
   * 무엇이 바뀌었는지 놓친다. 이 화면은 내가 "확인함"을 눌러도 갱신되지 않았다 — 그 조작
   * 옆에 있는 동료의 것까지 묶여 있었기 때문이다.
   *
   * 주기는 길게 둔다. 확인과 반박은 사람이 하는 일이라 몇 초 차이는 답답함보다 거슬림이 크다.
   * 내가 직접 한 조작의 결과는 `router.refresh()` 가 먼저 반영하므로, 폴링이 그 위에 덮어쓰지
   * 않는다(같은 행은 같은 내용이다).
   */
  /**
   * 이 화면도 저절로 따라온다 — 내가 "확인함"을 눌러도 목록은 그대로였고, 동료가 확인하거나
   * 반박해 나타나도 화면을 넘기기 전까지는 보이지 않았다. 함께 보고 있는 목록인데 옆 사람이
   * 갱신되지 않으면, 그 사이에 무엇이 바뀌었는지 놓친다.
   *
   * **내 조작이 우선이다.** 내가 직접 한 조작은 `router.refresh()` 로 반영되는데, 그 사이에
   * 도착한 낡은 폴링 결과가 위에 얹히면 방금 한 조작이 뒤로 물러난 것처럼 보인다. 그래서
   * 내가 조작하기 전까지만 폴링 결과를 쓴다 — 내가 이미 한 조작이 있으면 서버가 준 값을 따른다
   * (그 뒤로는 폴링이 필요 없다: 내가 계속 조작하므로 그때마다 갱신된다).
   *
   * 주기는 길게 둔다. 확인·반박은 사람이 하는 일이라 몇 초 차이는 답답함보다 거슬림이 크다.
   */
  const [polled, setPolled] = useState<TeamCheckRecord[] | null>(null);
  const [touched, setTouched] = useState(false);

  usePoll(
    async () => {
      if (touched) return;
      setPolled(await pollContribCheck());
    },
    CONTRIB_POLL_MS,
    !touched,
  );

  const list = touched ? records : (polled ?? records);

  const confirm = (record: TeamCheckRecord) =>
    run(
      "act",
      async () => {
        // 내가 건드린 뒤로는 서버가 준 값을 따른다 — 폴링은 그만 돈다.
        setTouched(true);
        const result = await confirmContribRecord(record.id);
        router.refresh();
        return result === "ok"
          ? `${record.who}님의 기록을 확인했습니다`
          : result === "already"
            ? "이미 확인한 기록입니다"
            : result === "mine"
              ? "자기 기록은 확인할 수 없습니다"
              : "의견 차이가 정리된 뒤에 확인할 수 있습니다";
      },
      "확인하지 못했습니다. 다시 시도해 주세요.",
    );

  const submitDispute = () => {
    if (!disputing || !reason.trim()) return Promise.resolve(false);
    return run(
      "act",
      async () => {
        setTouched(true);
        const result = await disputeContribRecord(disputing.id, reason);
        setDisputing(null);
        setReason("");
        router.refresh();
        return result === "ok"
          ? "적은 의견이 기록에 남았습니다"
          : result === "taken"
            ? "이미 다른 의견이 걸려 있습니다"
            : "자기 기록에는 적을 수 없습니다";
      },
      "의견을 남기지 못했습니다. 다시 시도해 주세요.",
    );
  };

  const confirmed = list.filter((r) => r.state === "ok").length;
  const disputed = list.filter((r) => r.state === "disputed");
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
              {list.length}건 중 {confirmed}건 확인 완료
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
          {list.map((record) => (
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

                  {record.evidence ? (
                    <div className="mt-[9px]">
                      <EvidenceLink recordId={record.id} evidence={record.evidence} />
                    </div>
                  ) : null}

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
                      {/* **전부** 보여 준다. 예전에는 지금 떠 있는 의견 하나만 나왔고,
                          새로 의견이 달리면 앞선 말이 화면에서 사라졌다. 시간순으로
                          쌓이고 정리된 뒤에도 남아 있는 것이 이 기록의 이력이다. */}
                      {record.history.length > 1 ? (
                        <ol className="mb-[6px] list-none p-0">
                          {record.history.map((opinion, i) => {
                            const settled =
                              record.resolution !== null && i < record.history.length - 1;
                            return (
                              <li key={`${opinion.who}-${i}`} className="mb-1.5 last:mb-0">
                                <span className="t-cap-strong font-bold text-[#8A3B31]">
                                  {opinion.who}
                                </span>
                                <span className="text-pretty-keep text-[13.5px] leading-[1.55] text-[#8A3B31]">
                                  {opinion.text}
                                </span>
                                {settled ? (
                                  <span className="t-cap ml-1 text-[#8A3B31] opacity-70">
                                    (이후 정리됨)
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ol>
                      ) : null}
                      {/* 의견이 하나뿐이면 위 목록 대신 이것만 보여 준다(이름 없이). */}
                      {record.history.length > 1 ? null : (
                        <div className="text-pretty-keep text-[13.5px] leading-[1.55] text-[#8A3B31]">
                          {record.dispute}
                        </div>
                      )}
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
                          {/* 목록이 아니라 이 기록을 두고 이야기할 사람과의 대화방으로 간다. */}
                          {record.dmWith ? (
                            <Btn
                              size="sm"
                              v="outline"
                              icon="messages-square"
                              onClick={() => router.push(`/chat/dm/${record.dmWith}`)}
                            >
                              1:1 DM
                            </Btn>
                          ) : null}
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
