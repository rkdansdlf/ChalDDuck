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
import { cn } from "@/lib/cn";
import type { ConfirmsPolicy, Member, TeamCheckRecord } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import {
  confirmContribRecord,
  disputeContribRecord,
  pollContribCheck,
  setConfirmsNeeded,
  setParticipation,
} from "@/server/actions/contrib";
import { isMarked, participationText } from "./participation";
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
  policy,
  isLeader,
}: {
  records: TeamCheckRecord[];
  roster: Member[];
  /** 몇 명이 확인해야 확정인지. 팀장만 바꿀 수 있다. */
  policy: ConfirmsPolicy;
  /** 팀장만 참여를 표시하고 지울 수 있다(화면이 숨기는 것 — 서버도 다시 확인한다). */
  isLeader: boolean;
}) {
  const router = useRouter();
  const [disputing, setDisputing] = useState<TeamCheckRecord | null>(null);
  const [reason, setReason] = useState("");
  /** 기준을 바꾸기 전에 "이렇게 바뀌는데 괜찮나"를 한 번 더 묻는다. */
  const [changing, setChanging] = useState<{ needed: number; affected: number } | null>(null);
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

  /**
   * 기준을 고른다 — **서버가 몇 건이 달라지는지 먼저 말하고**, 그대로 할지 다시 받는다.
   *
   * 1명 기준 아래에서 "확정"이던 기록을 2명으로 바꾸면 그 기록은 다시 기다려야 한다. 모른 채
   * 확정 숫자가 줄면 팀이 무엇이 사라졌는지 알 수 없다.
   */
  const askChange = async (needed: number) => {
    if (needed === policy.needed) return;
    await run(
      "policy",
      async () => {
        const preview = await setConfirmsNeeded(needed, false);
        if (preview.ok) {
          router.refresh();
          return `확정 기준을 ${needed}명으로 바꿨습니다`;
        }
        setChanging({ needed, affected: preview.affected });
        return null;
      },
      "기준을 바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  };

  const applyChange = async () => {
    if (!changing) return;
    await run(
      "policy",
      async () => {
        const result = await setConfirmsNeeded(changing.needed, true);
        setChanging(null);
        router.refresh();
        return result.affected > 0
          ? `확정 기준을 ${result.needed}명으로 바꿨습니다 · 기록 ${result.affected}건이 다시 계산됐습니다`
          : `확정 기준을 ${result.needed}명으로 바꿨습니다`;
      },
      "기준을 바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  };

  /**
   * 참여 표시를 찍거나 지운다 — **팀장만**(액션이 `requireLeader` 로 다시 확인한다).
   *
   * 확인(맞습니다)과 달리 **자기 기록에도** 찍을 수 있다: 확인은 "기록이 사실인가"를
   * 남이 판단하는 것이고, 참여 표시는 팀장이 정하는 자리이기 때문이다. 기록의 상태는
   * 어느 쪽에서도 건드리지 않는다.
   */
  const toggleParticipation = (record: TeamCheckRecord) =>
    run(
      "participation",
      async () => {
        setTouched(true);
        const marked = isMarked(record.participation);
        const result = await setParticipation(record.id, !marked);
        router.refresh();
        return result === "marked"
          ? `${record.who}님의 기록을 참여로 표시했습니다`
          : result === "cleared"
            ? "참여 표시를 취소했습니다"
            : result === "gone"
              ? "기록을 찾을 수 없습니다"
              : marked
                ? "이미 표시되어 있습니다"
                : "표시되어 있지 않습니다";
      },
      "참여 표시하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

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

        {/* 확정 기준. 예전에는 코드의 상수였고, "몇 명인지"가 검토 안내에만 적혀 있었다. */}
        <Panel s="fill" pad={14} r={16} className="mb-3.5">
          <div className="flex items-start gap-2.5">
            <span className="flex-none text-txt-muted">
              <Icon name="users-round" size={17} />
            </span>
            <span className="keep-all min-w-0 flex-1 font-semibold text-[13.5px] leading-[1.5] text-txt">
              기록은 <b>{policy.needed}명</b>이 확인하면 확정돼요
              {policy.needed > 1 ? (
                <span className="text-txt-muted">
                  {" "}
                  · 지금까지 모인 확인은 그대로 두고, 모인 인원이 기준에 도달하면 확정돼요
                </span>
              ) : null}
            </span>
          </div>
          {policy.canChange ? (
            <div
              role="radiogroup"
              aria-label="확정에 필요한 확인 인원"
              className="mt-2.5 flex gap-[5px]"
            >
              {Array.from({ length: policy.max }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={policy.needed === n}
                  disabled={working}
                  onClick={() => askChange(n)}
                  className={cn(
                    "min-h-11 flex-1 cursor-pointer rounded-[10px] border-none font-bold text-[13px] leading-none",
                    policy.needed === n ? "bg-yellow-400 text-ink-900" : "bg-fill text-txt",
                  )}
                >
                  {n}명
                </button>
              ))}
            </div>
          ) : null}
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

                  {/* 참여 표시 — 17 화면에만 둔다. 16(내 기록)은 내 기록만 고치는 곳이라
                      남의 판단이 거기까지 오면 "왜 이게 나야"만 남습니다. 누가 찍었는지는
                      말하고, 순위도 점수도 만들지 않습니다(README 3절). */}
                  {record.participation || isLeader ? (
                    <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
                      {record.participation ? (
                        <Chip tone={isMarked(record.participation) ? "ok" : "n"} icon="users-round">
                          {participationText(record.participation)}
                        </Chip>
                      ) : null}
                      {isLeader ? (
                        <Btn
                          size="sm"
                          v="ghost"
                          icon={isMarked(record.participation) ? "x" : "check"}
                          disabled={working}
                          onClick={() => toggleParticipation(record)}
                        >
                          {isMarked(record.participation)
                            ? "표시 취소"
                            : record.participation
                              ? "다시 표시"
                              : "참여로 표시"}
                        </Btn>
                      ) : null}
                    </div>
                  ) : null}

                  {record.evidence ? (
                    <div className="mt-[9px]">
                      <EvidenceLink recordId={record.id} evidence={record.evidence} />
                    </div>
                  ) : null}

                  {/* **버튼을 감추면서 이유도 같이 말한다.** 기록 주인이거나(자기 기록은
                      자기가 확인할 수 없다) 반대를 적은 사람이면 그 자리에서 확인이 막힌다 —
                      `canConfirm` 이 화면과 서버가 같이 쓰는 한 함수다. 이유를 말하지 않으면
                      "누락"으로 읽힌다. */}
                  {record.confirmBlockedBy && !record.iConfirmed ? (
                    <p className="t-cap keep-all m-0 mt-[9px] text-txt-muted">
                      {record.confirmBlockedBy}
                    </p>
                  ) : null}

                  {/* 자기 기록은 확인할 수도, 정정을 적을 수도 없다 — 본인 말만으로
                      확정되면 기록이 근거가 되지 못한다는 것이 이 절차의 전부다. */}
                  {!record.isMine && !record.confirmBlockedBy && record.state !== "disputed" ? (
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
                        <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
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
                          {/* 응답은 다툼의 당사자(기록 주인·의견을 적은 사람)만 한다.
                              남는 팀원에게는 버튼을 감추되 **왜 없는지도 같이 말한다** —
                              이유를 말하지 않으면 화면이 고장난 것으로 읽힌다. */}
                          {record.iCanResolve ? (
                            <Btn
                              size="sm"
                              v="ghost"
                              icon="split"
                              onClick={() => router.push(`/team/contrib/resolve/${record.id}`)}
                            >
                              정정에 응답하기
                            </Btn>
                          ) : (
                            <span className="t-cap keep-all inline-flex items-center gap-1 text-txt-faint">
                              <Icon name="info" size={12} />
                              기록을 적은 사람만 답할 수 있습니다
                            </span>
                          )}
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
        {/* 이 화면에는 예전에 `Undecided` 가 있었다 — "양쪽 의견을 함께 남긴다" 와 "누가 정정에
            답할 수 있는가" 가 기획에 없다는 말이었다. 둘 다 정해졌고, 근거도 이미 코드에 있다.
            결정을 남기는 한(직전 `Note`)과 대상을 정하는 한(`contrib/state.ts` 의
            `canResolveContrib`)이 각각 설명을 가지고 있으므로, **같은 말을 세 번 하지 않는다.**
            상자가 열려 있으면 검토 모드가 실제 미결 대신 이미 끝난 일을
            세게 된다. */}

        {/* 위와 별개로, 아직 정해지지 않은 것이 하나 더 있다. 의견이 닫히고 나면 이 화면이
            남는 자리라서 여기에 적었다(문서에 적으면 이 목록과 어긋난다). */}
        <Undecided>
          <b>반대를 철회하는 길이 없습니다.</b> 직접 쓴 의견은 기록에 그대로 남습니다 — 한쪽 말로
          덮지 않기 위해 지우지 않습니다. 사후에 "내가 그랬던 것 같다"로 바꾸려면 기록 주인과 다시
          적어야 합니다. 참여 표시처럼 되돌리되 흔적을 남길 수도 있고, 의견은 한 번의 말이라 두지
          않기로 할 수도 있습니다.
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
        open={changing !== null}
        title={changing ? `확정 기준을 ${changing.needed}명으로` : undefined}
        onClose={() => setChanging(null)}
      >
        {changing ? (
          <>
            <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
              {changing.affected > 0 ? (
                <>
                  지금까지 모인 확인 인원이 기준에 못 미쳐 <b>기록 {changing.affected}건</b>이 상태가
                  다시 바뀝니다. 모인 확인은 지워지지 않고, 기준에 도달하면 다시 확정돼요.
                </>
              ) : (
                <>지금 상태가 달라지는 기록은 없습니다. 기준만 바뀌어요.</>
              )}
            </p>
            <Note tone="info" icon="info" className="mb-3">
              기준을 올리면 확인이 모인 기록이 다시 기다립니다. 내리면 모이지 않은 기록이 곧바로
              확정돼요.
            </Note>
            <div className="flex flex-col gap-2">
              <Btn full disabled={working} onClick={applyChange}>
                {working ? "바꾸는 중…" : `${changing.needed}명으로 정하기`}
              </Btn>
              <Btn full v="outline" icon="x" onClick={() => setChanging(null)}>
                그대로 두기
              </Btn>
            </div>
          </>
        ) : null}
      </Sheet>

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
