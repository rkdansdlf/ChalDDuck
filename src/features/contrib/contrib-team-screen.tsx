"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Dock,
  Icon,
  Note,
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
  roster: _roster,
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
  const [tab, setTab] = useState<"toCheck" | "disputed" | "all">("toCheck");
  const [policySheetOpen, setPolicySheetOpen] = useState(false);
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

  const disputed = list.filter((r) => r.state === "disputed");
  const toCheckRecords = list.filter((r) => !r.isMine && !r.iConfirmed && r.state !== "disputed");
  const displayedRecords =
    tab === "toCheck" ? toCheckRecords : tab === "disputed" ? disputed : list;

  return (
    <>
      <AppBar
        title="기여 기록 확인"
        sub="3 / 4단계 · 팀원 확인"
        onBack={() => router.push("/team/contrib")}
      />

      <Body dense>
        <StepRail at={2} />

        {/* 3단 세그먼트 필터 탭 */}
        <div className="mb-3.5 flex gap-1.5 rounded-[13px] bg-fill p-1">
          <button
            type="button"
            onClick={() => setTab("toCheck")}
            className={cn(
              "flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none font-bold text-[13px]",
              tab === "toCheck"
                ? "bg-card text-txt-strong shadow-2xs"
                : "bg-transparent text-txt-muted",
            )}
          >
            <span>내가 확인할 것</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none",
                tab === "toCheck" ? "bg-txt-strong text-card" : "bg-line text-txt-muted",
              )}
            >
              {toCheckRecords.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("disputed")}
            className={cn(
              "flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none font-bold text-[13px]",
              tab === "disputed"
                ? "bg-card text-txt-strong shadow-2xs"
                : "bg-transparent text-txt-muted",
            )}
          >
            <span>의견 다름</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none",
                tab === "disputed" ? "bg-err text-white" : "bg-line text-txt-muted",
              )}
            >
              {disputed.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("all")}
            className={cn(
              "flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none font-bold text-[13px]",
              tab === "all" ? "bg-card text-txt-strong shadow-2xs" : "bg-transparent text-txt-muted",
            )}
          >
            <span>전체</span>
            <span className="text-[11.5px] font-normal text-txt-muted">{list.length}</span>
          </button>
        </div>

        {/* 확정 기준 안내 및 기준 변경 링크 */}
        <div className="mb-4 flex items-center justify-between text-[13.5px]">
          <div className="flex items-center gap-1.5 text-txt">
            <Icon name="users-round" size={15} className="text-txt-muted" />
            <span>
              팀원 <b>{policy.needed}명</b>이 확인하면 확정돼요
            </span>
          </div>
          {policy.canChange ? (
            <button
              type="button"
              onClick={() => setPolicySheetOpen(true)}
              className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-bold text-txt-strong hover:underline"
            >
              기준 바꾸기
            </button>
          ) : null}
        </div>

        {/* 기록 카드 목록 */}
        <div className="mb-5 flex flex-col gap-3">
          {displayedRecords.length === 0 ? (
            <div className="rounded-[18px] border border-line bg-card p-8 text-center">
              <p className="t-note m-0 text-txt-muted">
                {tab === "toCheck"
                  ? "내가 확인할 기록이 없습니다."
                  : tab === "disputed"
                    ? "의견 차이가 있는 기록이 없습니다."
                    : "기록이 없습니다."}
              </p>
            </div>
          ) : (
            displayedRecords.map((record) => {
              const dots = Array.from({ length: policy.needed });
              const remaining = policy.needed - record.confirms;
              const subText = record.isMine
                ? "내 기록"
                : record.iConfirmed
                  ? "내가 확인 완료"
                  : remaining === 1
                    ? "내가 확인하면 확정돼요"
                    : `내가 확인하면 ${remaining - 1}명 남아요`;

              return (
                <div
                  key={record.id}
                  className="rounded-[18px] border border-line bg-card p-4 shadow-2xs"
                >
                  {/* 상단: 아바타 + 이름 + 날짜 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7.5 place-items-center rounded-full bg-yellow-100 text-[12.5px] font-bold text-yellow-800">
                        {record.who.charAt(0)}
                      </div>
                      <span className="font-bold text-[15px] text-txt-strong">{record.who}</span>
                    </div>
                    <span className="text-[12.5px] font-medium text-txt-muted">
                      {record.evidence ? "9/11 – 9/18" : "9월"}
                    </span>
                  </div>

                  {/* 제목 */}
                  <h3 className="m-0 mt-2.5 font-bold text-[15.5px] leading-snug text-txt-strong">
                    {record.title}
                  </h3>
                  <div className="mt-0.5 text-[13px] text-txt-muted">
                    {record.evidence ? "드라이브 버전 기록" : "확정된 역할: 일정 관리"}
                  </div>

                  {/* 증빙 첨부 파일 */}
                  {record.evidence ? (
                    <div className="mt-2.5">
                      <EvidenceLink recordId={record.id} evidence={record.evidence} />
                    </div>
                  ) : null}

                  {/* 참여 표시 — 팀장 권한 및 표시 현황 */}
                  {record.participation || isLeader ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {record.participation ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium",
                            isMarked(record.participation)
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-100 text-zinc-500",
                          )}
                        >
                          <Icon name="users-round" size={12} />
                          {participationText(record.participation)}
                        </span>
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

                  {/* 도트 확인 인디케이터 */}
                  <div className="mt-3 flex items-center gap-1.5 text-[13px]">
                    <span className="flex items-center gap-1">
                      {dots.map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "size-2 rounded-full inline-block",
                            i < record.confirms
                              ? "bg-txt-strong"
                              : "border border-line-strong/60 bg-transparent",
                          )}
                        />
                      ))}
                    </span>
                    <span className="font-bold text-txt-strong">
                      확인 {record.confirms}/{policy.needed}명
                    </span>
                    <span className="text-txt-muted">· {subText}</span>
                  </div>

                  {/* 의견 차이 내용 (있을 때) */}
                  {record.dispute ? (
                    <div className="mt-3 rounded-xl bg-err-bg px-3 py-2.5">
                      <div className="t-cap-strong mb-1 font-bold text-[#8A3B31]">적힌 의견</div>
                      <div className="text-[13.5px] leading-[1.5] text-[#8A3B31]">
                        {record.dispute}
                      </div>
                      {record.dmWith ? (
                        <div className="mt-2">
                          <Btn
                            size="sm"
                            v="outline"
                            icon="messages-square"
                            onClick={() => router.push(`/chat/dm/${record.dmWith}`)}
                          >
                            1:1 DM
                          </Btn>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 버튼 영역 */}
                  {!record.isMine && !record.confirmBlockedBy && record.state !== "disputed" ? (
                    <div className="mt-3 flex gap-2">
                      {record.iConfirmed ? (
                        <div className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-ok/30 bg-ok-bg py-2 text-[13px] font-bold text-want">
                          <Icon name="check" size={14} strokeWidth={2.5} />
                          <span>맞아요</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => confirm(record)}
                          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-txt-strong bg-card py-2 text-[13px] font-bold text-txt-strong transition-colors hover:bg-fill active:scale-95"
                        >
                          <Icon name="check" size={14} strokeWidth={2.5} />
                          <span>맞아요</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={working}
                        onClick={() => {
                          setReason("");
                          setDisputing(record);
                        }}
                        className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-line bg-card py-2 text-[13px] font-semibold text-txt transition-colors hover:bg-fill active:scale-95"
                      >
                        <Icon name="pen-line" size={14} />
                        <span>사실과 달라요</span>
                      </button>
                    </div>
                  ) : record.isMine ? (
                    <p className="t-note m-0 mt-2.5 text-txt-muted">
                      내 기록은 내가 확인할 수 없습니다
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* 의견이 닫히고 나면 이 화면이 남는 곳이다 — 그래서 "답이 없는 반대를 되돌리는 길"이
            없는 것도 여기에 적는다. `npm run decisions` 가 이 상자를 읽는다. */}
        <Undecided>
          <b>반대를 철회하는 길이 없습니다.</b> 직접 쓴 의견은 기록에 그대로 남습니다(한쪽 말로
          덮지 않기 위해 지우지 않습니다). 사후에 &quot;내가 그랬던 것 같다&quot;로 바꾸려면 기록 주인과
          다시 적어야 합니다. 참여 표시처럼 되돌리되 흔적을 남길 수도 있고, 의견은 한 번의
          말이라 두지 않기로 할 수도 있습니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          onClick={() => router.push("/team/contrib/report")}
          iconRight="arrow-right"
        >
          리포트 미리 보기
        </Btn>
      </Dock>

      {/* 기준 변경 바텀 시트 */}
      <Sheet
        open={policySheetOpen}
        title="확정 기준 변경"
        onClose={() => setPolicySheetOpen(false)}
      >
        <div className="p-4">
          <p className="t-body mb-4 text-txt">
            몇 명이 확인했을 때 기록을 확정할지 선택해 주세요.
          </p>
          <div className="flex gap-2">
            {Array.from({ length: policy.max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={working}
                onClick={async () => {
                  await askChange(n);
                  setPolicySheetOpen(false);
                }}
                className={cn(
                  "min-h-11 flex-1 cursor-pointer rounded-[12px] border font-bold text-[14px]",
                  policy.needed === n
                    ? "border-yellow-400 bg-yellow-400 text-ink-900"
                    : "border-line bg-fill text-txt",
                )}
              >
                {n}명
              </button>
            ))}
          </div>
        </div>
      </Sheet>

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
