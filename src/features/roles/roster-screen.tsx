"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  DrawGame,
  Icon,
  Input,
  Note,
  Panel,
  Rows,
  SecTitle,
  Sheet,
  Toast,
  type DrawCandidate,
  type IconName,
} from "@/components/ui";
import type { InviteRow } from "@/data/api";
import type { Member, RandomTool, Role, RoleKey, RoleNegotiation, Team } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import { createInviteLink, disableInviteLink } from "@/server/actions/invite";
import { acceptRoleDraw, claimSoleRole, drawForRole, proposeRoleDraw, rejectRoleDraw, respondRoleDraw } from "@/server/actions/roles";
import { unhideDmThread } from "@/server/actions/dm";
import { EXPIRY_CHOICES, USE_CHOICES } from "@/server/invite/choices";
import {
  NO_DRAW_POOL_TEXT,
  applyMyChoices,
  canDrawIn,
  canProposeIn,
  consentViewOf,
  drawPoolOf,
  roleViewOf,
  wantersOf,
  type ConsentView,
  type RoleView,
} from "./roster-model";

/**
 * 기한을 사람이 읽을 이름으로.
 *
 * **키를 `EXPIRY_CHOICES` 의 값으로 갖는다.** 값을 문자열로 따로 적지 않으므로 목록과 이름이
 * 어긋날 수 없고, `EXPIRY_CHOICES` 에 값을 하나 더 넣으면 여기가 컴파일 에러가 난다 — 이름을
 * 붙이지 않은 선택지가 사용자에게 "7일" 처럼 숫자로 노출되지 않는다.
 */
const EXPIRY_LABELS: Record<(typeof EXPIRY_CHOICES)[number], string> = {
  1: "하루",
  3: "3일",
  7: "일주일",
  30: "한달",
};

/**
 * 07 팀 역할 조율.
 *
 * 위: 역할별 현황(희망자 수 · 협의 상태). 아래: 팀원별 선호.
 * 두 사람 이상이 같은 역할을 1순위로 고르면 "협의 중"이 되고,
 * 협의 → 추첨 → 당사자 수락 순서로 풀어 나간다.
 *
 * MBTI 배지를 일부러 넣지 않는다 — 역할 조율 화면에서 유형이 보이면
 * 배정에 영향을 주는 것처럼 읽히기 때문이다.
 */
export function RosterScreen({
  team,
  roles,
  roster,
  tools,
  negotiation,
  now: nowIso,
  rejoinPending,
  invites,
  isLeader,
}: {
  team: Team;
  roles: Role[];
  roster: Member[];
  tools: RandomTool[];
  negotiation: RoleNegotiation;
  /**
   * 서버가 이 화면을 그릴 때의 시각(ISO).
   *
   * 동의 대기는 `respondBy` 와 "지금"을 비교해 정한다. 클라이언트가 다시 재면 서버가 그린
   * 것과 다른 그림이 그려진다(하이드레이션 불일치) — 시각은 읽는 곳에서 한 번만 정한다.
   */
  now: string;
  /** 팀장이 승인해 줘야 하는 재입장 요청 수. 팀장이 아니면 0. */
  rejoinPending: number;
  /** 팀이 나눈 초대들. 팀장이 아니면 빈 목록 — 링크를 다시 보여줄 수는 없다(아래 주석). */
  invites: InviteRow[];
  isLeader: boolean;
}) {
  const router = useRouter();
  const onboarding = useOnboarding();
  const { draws, rejected, consents } = negotiation;
  const { toast, busy, flash, run } = useAction();

  /** 추첨 도구를 고르는 중인 역할. */
  const [drawingFor, setDrawingFor] = useState<RoleKey | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  /**
   * 시트 안에서 **고른 도구.** 누르는 즉시 뽑지 않고 고른 뒤 무엇을 할지 고른다 —
   * "지금 뽑기"와 "팀에 제안" 두 길이 있으므로 탭이 곧 실행이면 실수로 바로 뽑힌다.
   */
  const [pickedTool, setPickedTool] = useState<RandomTool | null>(null);
  /**
   * **방금 만든 초대 링크의 원문.** 여기서만 산다.
   *
   * 서버에는 해시만 남으므로 다시 못 가져온다. 시트를 닫으면 사라지고, 다시 열어도 돌아오지
   * 않는다 — 링크를 잃어버린 팀장은 "새로 만들어 달라"로 가야 한다. 그게 되돌릴 수 있다는
   * 사실과 같은 약속이다.
   */
  const [freshLink, setFreshLink] = useState<{ label: string; url: string } | null>(null);
  /** 서버 응답을 기다리는 동안 고른 도구 — 다 오면 바로 연출로 넘어간다. */
  const [rollingTool, setRollingTool] = useState<RandomTool | null>(null);
  /** 연출 중인 결과 — 서버가 이미 정한 당첨자를 쥐고 있다가 연출이 끝나면 확정 대기로 넘긴다. */
  const [drawResult, setDrawResult] = useState<{
    tool: RandomTool;
    pool: DrawCandidate[];
    winner: string;
  } | null>(null);

  const members = useMemo(
    () =>
      applyMyChoices(roster, {
        name: onboarding.name,
        mbti: onboarding.effectiveMbti,
        want: onboarding.want,
        veto: onboarding.veto,
      }),
    [roster, onboarding.name, onboarding.effectiveMbti, onboarding.want, onboarding.veto],
  );

  /**
   * 내가 당첨자인지 판정할 **id**.
   *
   * 이름으로 비교하면 같은 이름이 생겼을 때 화면은 "나" 라고 판단하고 서버는 남이라
   * 판단한다 — 서버는 `actions/roles` 에서 이미 id 로 본다. 이름은 고칠 수 있으므로
   * 판정은 id 로만 한다.
   */
  const myId = roster.find((m) => m.isMe)?.id ?? null;

  const inviteUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/join?code=${team.code}`;

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(team.code);
      flash("초대 코드를 복사했습니다");
    } catch {
      flash("복사하지 못했습니다. 화면의 코드를 직접 옮겨 적어 주세요.");
    }
  };

  const shareInviteLink = async () => {
    const payload = { title: "찰떡 팀 초대", text: `${team.name} 팀에 초대합니다`, url: inviteUrl };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // 사용자가 공유 시트를 닫은 경우 — 복사로 넘어간다
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      flash("초대 링크를 복사했습니다");
    } catch {
      flash("공유하지 못했습니다. 초대 코드를 대신 알려 주세요.");
    }
  };

  /**
   * 이미 거절한 사람. `rejected` 는 이름으로 내려오지만 규칙 함수는 id 로 비교한다 —
   * 이름은 바꿀 수 있는 값이라 두 번 거르면 다른 사람으로 새는 이유가 된다.
   */
  const excludedIdsOf = (role: RoleKey) => {
    const names = new Set(rejected[role] ?? []);
    return members.filter((m) => names.has(m.name)).map((m) => m.id);
  };

  /** 지금 화면에 그릴 동의 상태. 서버가 준 시각으로만 판한다(하이드레이션 불일치 방지). */
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const consentFor = (role: RoleKey): ConsentView => consentViewOf(consents[role] ?? null, now);
  /** 시트가 열려 있는 역할의 동의 상태 — 있으면 시트 첫 화면이 도구 고르기가 아니다. */
  const sheetConsent: ConsentView | null = drawingFor ? consentFor(drawingFor) : null;
  /**
   * 시트가 그리는 역할의 상태. **두 버튼의 가능 여부를 이 한 판정에서 나온다.**
   *
   * 동의 대기가 아닐 때는 `open` 이므로 `canDrawIn`/`canProposeIn` 어느 쪽이든 정상적으로
   * 열린다 — 시트 첫 화면이 이미 `ConsentPanel` 이라 여기까지 오지 않기 때문이다.
   */
  const sheetView: RoleView = drawingFor
    ? roleViewOf(wantersOf(members, drawingFor).length, draws[drawingFor] ?? null, sheetConsent ?? { kind: "open" })
    : { kind: "empty" };

  /** 서버의 `drawPoolOf` 와 같은 규칙으로 연출에 쓸 후보를 고른다. */
  const candidatePoolFor = (role: RoleKey): DrawCandidate[] =>
    drawPoolOf(wantersOf(members, role), role, new Set(excludedIdsOf(role))).pool.map((m) => ({
      name: m.name,
      mbti: m.mbti,
    }));

  /**
   * 추첨을 **팀에 제안한다** — 도구도 함께 올린다.
   *
   * 제안이 살아 있으면 또 올리지 않는다. 서버도 막지만 화면이 알고 있으면 버튼을 닫아
   * 눌렀다가 "이미 제안했습니다"만 듣게 하지 않는다.
   */
  const handlePropose = async (tool: RandomTool) => {
    if (!drawingFor) return;
    const role = drawingFor;
    const roleLabel = roles.find((r) => r.key === role)?.name ?? "역할";
    await run(
      "propose",
      async () => {
        const result = await proposeRoleDraw(role, tool.name);
        router.refresh();
        if (result === "already") return "이미 동의를 받고 있는 제안이 있습니다";
        if (result === "settled") return `${roleLabel}은(는) 이미 정해졌거나 기다리는 중입니다`;
        setPickedTool(null);
        setDrawingFor(null);
        return `${roleLabel} 추첨을 ${tool.name}으로 제안했습니다 — 팀이 동의해야 진행됩니다`;
      },
      "제안하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  };

  /** 팀원이 동의하거나 반대한다. 어느 쪽이든 시트를 닫고 목록으로 돌아간다. */
  const handleConsentAnswer = (role: RoleKey, agree: boolean, roleLabel: string) =>
    run(
      "consent",
      async () => {
        const answer = await respondRoleDraw(role, agree);
        router.refresh();
        if (answer === "closed") return "이미 마감 났거나 제안이 없습니다";
        setPickedTool(null);
        setDrawingFor(null);
        return agree ? "동의했습니다" : `${roleLabel} 추첨에 반대했습니다`;
      },
      agree ? "동의하지 못했습니다." : "반대하지 못했습니다.",
    );

  /**
   * 당첨자는 서버가 고른다 — 화면에서 뽑아 보내면 누구나 자기를 적어 보낼 수 있다.
   * 응답이 오면 바로 닫지 않고, 정해진 당첨자를 쥔 채로 도구별 연출을 먼저 보여 준다.
   */
  const handleDraw = async (tool: RandomTool) => {
    if (!drawingFor) return;
    const role = drawingFor;
    const pool = candidatePoolFor(role);
    setRollingTool(tool);
    // 예전에는 `setRollingTool(null)` 이 `await` 밖에 있어서, 서버가 거절하면 값이
    // 남았다. 그 상태에서 시트도 닫을 수 없고(아래 `onClose` 가 rollers 를 본다) 뒤로
    // 가도 없어서, 스피너에서 영영 갇혔다. 이제 실패해도 반드시 풀린다.
    await run(
      "draw",
      async () => {
        const result = await drawForRole(role, tool.name);
        if (result.status !== "ok") {
          setDrawingFor(null);
          router.refresh();
          flash(
            result.status === "empty"
              ? NO_DRAW_POOL_TEXT[result.noPool]
              : "이미 추첨 결과가 나와 있습니다 — 당첨자가 안 받으면 다시 뽑을 수 있습니다",
          );
          return;
        }
        setDrawResult({ tool, pool, winner: result.winner });
      },
      "추첨하지 못했습니다. 다시 시도해 주세요.",
    );
    setRollingTool(null);
  };

  /** 연출이 끝난 뒤 시트를 닫고 받기 대기 상태로 넘긴다. */
  const finishDraw = () => {
    const finished = drawResult;
    setDrawResult(null);
    setDrawingFor(null);
    router.refresh();
    if (finished) flash(`${finished.tool.name} 결과를 ${finished.winner}님에게 보냈습니다 — 받기 대기`);
  };

  const confirmedCount = roles.filter(
    (role) => roleViewOf(wantersOf(members, role.key).length, draws[role.key] ?? null).kind === "confirmed",
  ).length;

  // 내게 걸려 있는 겹침 역할 또는 팀의 협의 대상 역할 찾기
  const myOverlappingRole = roles.find((r) => {
    const w = wantersOf(members, r.key);
    return w.length > 1 && w.some((m) => m.isMe);
  });
  const anyOverlappingRole = roles.find((r) => wantersOf(members, r.key).length > 1);
  const heroRole = myOverlappingRole ?? anyOverlappingRole ?? roles[0];
  const heroWanters = heroRole ? wantersOf(members, heroRole.key) : [];
  const otherHeroMember = heroWanters.find((m) => !m.isMe);

  return (
    <>
      <AppBar
        title="역할 조율"
        sub={team.name}
        action="user-plus"
        actionLabel="팀원 초대하기"
        onAction={() => setInviteOpen(true)}
      />
      <Body dense>
        {/* 상단 진행도 및 마감 디데이 헤더 */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-[13.5px]">
            <span className="font-bold text-txt-strong">
              역할 {roles.length}개 중 {confirmedCount}개 정해짐
            </span>
            <span className="font-medium text-txt-muted">중간발표 D-12</span>
          </div>
          <div className="flex gap-1.5">
            {roles.map((r) => {
              const isConfirmed =
                roleViewOf(wantersOf(members, r.key).length, draws[r.key] ?? null).kind === "confirmed";
              return (
                <div
                  key={r.key}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    isConfirmed ? "bg-ok" : "bg-line-strong/40",
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* 상단 히어로 액션 카드 (내 차례 / 협의 진행 배너) */}
        {heroRole ? (
          <div className="mb-5 rounded-[20px] border border-yellow-200/90 bg-yellow-50/80 p-4 shadow-2xs">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-200/90 px-2 py-0.5 text-[11.5px] font-bold text-yellow-900">
                <Icon name="clock" size={12} strokeWidth={2.5} />
                내 차례
              </span>
            </div>

            <h2 className="t-h2 m-0 text-ink-900 text-[16.5px] font-extrabold leading-snug">
              {otherHeroMember
                ? `${heroRole.name}을 ${otherHeroMember.name}님도 원해요`
                : `${heroRole.name} 역할을 정할 차례예요`}
            </h2>
            <p className="m-0 mt-1 text-[13px] leading-[1.5] text-txt-muted">
              둘이 먼저 이야기해 보고, 정하기 어려우면 추첨해요.
            </p>

            {/* 5단계 조율 단계 노드 레일 */}
            <div className="my-3.5 flex items-center justify-between px-1">
              {[
                { label: "원함", done: true, current: false },
                { label: "이야기", done: false, current: true },
                { label: "추첨", done: false, current: false },
                { label: "받기", done: false, current: false },
                { label: "확정", done: false, current: false },
              ].map((step, idx, arr) => (
                <div key={step.label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-[11px] font-bold border",
                        step.done
                          ? "border-transparent bg-yellow-400 text-ink-900"
                          : step.current
                            ? "border-yellow-600 bg-card text-yellow-800 ring-2 ring-yellow-200"
                            : "border-line bg-card text-txt-faint",
                      )}
                    >
                      {step.done ? <Icon name="check" size={13} strokeWidth={2.5} /> : idx + 1}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-semibold",
                        step.done || step.current ? "text-txt-strong" : "text-txt-muted",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < arr.length - 1 ? (
                    <div className="mx-1 h-0.5 flex-1 bg-line-strong/30 -mt-4" />
                  ) : null}
                </div>
              ))}
            </div>

            {/* 히어로 카드 액션 버튼들 */}
            <div className="flex gap-2">
              <Btn
                full
                size="sm"
                icon="messages-square"
                onClick={async () => {
                  if (otherHeroMember) {
                    // **숨긴 대화는 먼저 되돌린다.** 빼 놓은 대화는 목록에 안 보이므로,
                    // 여기서 안 풀면 열어도 목록에 되돌아오지 않는다. 열기 자체는 되돌릴 수 없는
                    // 일이 아니므로 **자동으로** 풀어도 된다 — 사람이 그걸 아는 채로 눌렀다.
                    await unhideDmThread(otherHeroMember.id);
                    router.push(`/chat/dm/${otherHeroMember.id}`);
                  } else {
                    router.push("/chat/team");
                  }
                }}
              >
                {otherHeroMember ? `${otherHeroMember.name}님과 이야기하기` : "이야기해서 정하기"}
              </Btn>
              <Btn
                size="sm"
                v="outline"
                icon="dices"
                onClick={() => setDrawingFor(heroRole.key)}
              >
                추첨
              </Btn>
            </div>
          </div>
        ) : null}

        {/* 역할 목록 섹션 */}
        <div className="mb-2 text-[15px] font-bold text-txt-strong">역할</div>
        <div className="divide-y divide-line/60 rounded-[18px] border border-line bg-card overflow-hidden">
          {roles.map((role) => {
            const wanters = wantersOf(members, role.key);
            const vetoers = members.filter((m) => m.veto === role.key);
            const result = draws[role.key];
            const excluded = rejected[role.key] ?? [];
            // **동의를 넘겨야 목록이 잠긴 것을 안다.** 안 넘기면 이 역할은 "협의 중" 으로
            // 보이는데 추첨 시트는 동의 대기로 열려 있다 — 같은 역할이 두 상태로 보인다.
            const view = roleViewOf(wanters.length, result ?? null, consentFor(role.key));
            const iAmWinner = result !== undefined && myId !== null && result.winnerId === myId;

            return (
              <div key={role.key} className="p-3.5">
                {/* 헤더: 역할 이름 + 상태 칩 */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[15px] text-txt-strong">{role.name}</span>
                  {view.kind === "confirmed" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ok-bg px-2.5 py-0.5 text-[12px] font-bold text-want">
                      <Icon name="check" size={12} strokeWidth={2.5} />
                      확정 · {view.winner}
                    </span>
                  ) : view.kind === "consent" ? (
                    // **동의 대기는 "겹침" 과 다른 상태다.** 겹침은 우리가 정할 수 있지만,
                    // 동의 대기는 누군가 이미 올렸고 그 응답을 기다리는 중이다 — 말구분이
                    // 같으면 팀원이 왜 아무것도 못 하는지 알 수 없다.
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-200 px-2.5 py-0.5 text-[12px] font-bold text-yellow-800">
                      <Icon name="users-round" size={12} />
                      동의 대기 · {view.consent.tool}
                    </span>
                  ) : wanters.length > 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-[12px] font-bold text-yellow-800">
                      <Icon name="messages-square" size={12} />
                      겹침 · 이야기 중
                    </span>
                  ) : wanters.length === 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-semibold text-txt-muted">
                      <Icon name="user-round" size={12} />
                      한 명 원함
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-semibold text-txt-muted">
                      <Icon name="circle" size={11} />
                      원하는 사람 없음
                    </span>
                  )}
                </div>

                {/* 희망자 (맡을래) */}
                {wanters.length > 0 ? (
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-txt-muted flex-none">맡을래</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {wanters.map((w) => (
                          <div key={w.id} className="flex items-center gap-1">
                            <span className="grid size-6 place-items-center rounded-full bg-yellow-100 text-[11px] font-bold text-yellow-800">
                              {w.name.charAt(0)}
                            </span>
                            <span className="text-[13.5px] font-semibold text-txt-strong">
                              {w.isMe ? `${w.name} 나` : w.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 1명만 원할 때 바로 정하기 버튼 */}
                    {wanters.length === 1 && view.kind === "auto" ? (
                      <button
                        type="button"
                        disabled={busy.claim}
                        onClick={() =>
                          void run(
                            "claim",
                            async () => {
                              const answer = await claimSoleRole(role.key);
                              router.refresh();
                              return answer === "ok"
                                ? `${role.name} 맡기로 정했습니다`
                                : "이미 정해졌거나 다른 사람이 고른 역할입니다";
                            },
                            "정하지 못했습니다.",
                          )
                        }
                        className="flex-none rounded-lg border border-line bg-card px-2.5 py-1 text-[12px] font-semibold text-txt-strong hover:bg-fill cursor-pointer active:scale-95"
                      >
                        {wanters[0].isMe ? "내가 맡기" : `${wanters[0].name}님으로 정하기`}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/* 피할래 목록 */}
                {vetoers.length > 0 ? (
                  <div className="mt-2 flex items-center gap-2 text-[13px]">
                    <span className="text-txt-muted flex-none">피할래</span>
                    <span className="text-txt-strong font-medium">
                      {vetoers.map((v) => (v.isMe ? `${v.name} (나)` : v.name)).join(" · ")}
                    </span>
                  </div>
                ) : wanters.length === 0 ? (
                  <div className="mt-2 text-[13px] text-txt-muted">피하는 사람은 없어요</div>
                ) : null}

                {/* 받기 대기 상태인 경우 */}
                {view.kind === "awaiting" && result ? (
                  <div className="mt-2.5 rounded-xl bg-fill p-2.5">
                    <div className="mb-2 text-[12px] font-semibold text-txt">
                      {result.tool} 결과 · {result.winner}님에게 확인 요청 중
                      {excluded.length > 0 ? ` (제외: ${excluded.join(", ")})` : ""}
                    </div>
                    {iAmWinner ? (
                      <div className="flex gap-2">
                        <Btn
                          size="sm"
                          icon="check"
                          disabled={busy.answer}
                          onClick={() =>
                            void run(
                              "answer",
                              async () => {
                                const answer = await acceptRoleDraw(role.key);
                                router.refresh();
                                return answer === "ok" ? "확정되었습니다" : "이미 정리된 추첨입니다";
                              },
                              "받지 못했습니다.",
                            )
                          }
                        >
                          받기
                        </Btn>
                        <Btn
                          size="sm"
                          v="ghost"
                          icon="x"
                          disabled={busy.answer}
                          onClick={() =>
                            void run(
                              "answer",
                              async () => {
                                const answer = await rejectRoleDraw(role.key);
                                router.refresh();
                                return answer === "ok"
                                  ? "다음 추첨에서 제외됩니다"
                                  : "이미 정리된 추첨입니다";
                              },
                              "안 받기로 하지 못했습니다.",
                            )
                          }
                        >
                          안 받기
                        </Btn>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* 동의 대기 — 목록에서도 바로 답한다. */}
                {view.kind === "consent" ? (
                  <ConsentPanel
                    consent={view.consent}
                    roleLabel={role.name}
                    busy={Boolean(busy.consent)}
                    onAgree={() => void handleConsentAnswer(role.key, true, role.name)}
                    onObject={() => void handleConsentAnswer(role.key, false, role.name)}
                    compact
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* 팀 관리 섹션 (아코디언 형태 그룹 리스트) */}
        <div className="t-sec mt-6 mb-2.5 font-bold text-txt-strong">팀</div>
        <div className="divide-y divide-line/60 rounded-[18px] border border-line bg-card overflow-hidden">
          {/* 기여 기록 */}
          <button
            type="button"
            onClick={() => router.push("/team/contrib")}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left hover:bg-fill cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Icon name="clipboard-check" size={17} className="text-txt-strong" />
              <span className="font-semibold text-[15px] text-txt-strong">기여 기록</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[12px] font-bold text-yellow-800">
                확인할 것 2
              </span>
              <Icon name="chevron-right" size={16} className="text-txt-muted" />
            </div>
          </button>

          {/* 계정과 기기 */}
          <button
            type="button"
            onClick={() => router.push("/team/access")}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left hover:bg-fill cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Icon name="lock" size={17} className="text-txt-strong" />
              <span className="font-semibold text-[15px] text-txt-strong">계정과 기기</span>
            </div>
            <div className="flex items-center gap-1.5">
              {rejoinPending > 0 ? (
                <span className="rounded-full bg-err-bg px-2 py-0.5 text-[12px] font-bold text-veto">
                  승인 요청 {rejoinPending}건
                </span>
              ) : null}
              <Icon name="chevron-right" size={16} className="text-txt-muted" />
            </div>
          </button>

          {/* 아이스브레이킹 */}
          <button
            type="button"
            onClick={() => router.push("/team/icebreak")}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left hover:bg-fill cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Icon name="drama" size={17} className="text-txt-strong" />
              <span className="font-semibold text-[15px] text-txt-strong">아이스브레이킹</span>
            </div>
            <Icon name="chevron-right" size={16} className="text-txt-muted" />
          </button>

          {/* 메뉴 룰렛 */}
          <button
            type="button"
            onClick={() => router.push("/team/roulette")}
            className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left hover:bg-fill cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Icon name="disc-3" size={17} className="text-txt-strong" />
              <span className="font-semibold text-[15px] text-txt-strong">메뉴 룰렛</span>
            </div>
            <Icon name="chevron-right" size={16} className="text-txt-muted" />
          </button>
        </div>
      </Body>

      <Sheet
        open={drawingFor !== null}
        title={
          rollingTool || drawResult
            ? undefined
            : // 동의 대기는 도구를 고르는 화면이 아니다 — 제목을 그대로 두면 무엇을 고르는지
              // 모른다. 역할 이름까지 넣어야 "무엇에 대한 응답인지"가 한 줄로 읽힌다.
              sheetConsent?.kind === "waiting" && drawingFor
              ? `${roles.find((r) => r.key === drawingFor)?.name ?? "역할"} 추첨 동의`
              : "추첨 방식 고르기"
        }
        onClose={() => {
          // 연출이 도는 동안은 결과를 끝까지 보게 한다 — 도중에 닫아도 서버 결과는 이미 저장돼 있다.
          if (rollingTool || drawResult) return;
          setPickedTool(null);
          setDrawingFor(null);
        }}
      >
        {drawResult ? (
          <DrawGame
            toolKey={drawResult.tool.key}
            toolName={drawResult.tool.name}
            candidates={drawResult.pool}
            winner={drawResult.winner}
            onFinish={finishDraw}
          />
        ) : rollingTool ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-3">
            <span className="animate-spin text-yellow-700">
              <Icon name="loader-circle" size={28} />
            </span>
            <p className="t-note text-txt-muted">{rollingTool.name} 준비 중…</p>
          </div>
        ) : sheetConsent && drawingFor && sheetConsent.kind === "waiting" ? (
          <ConsentPanel
            consent={sheetConsent}
            roleLabel={roles.find((r) => r.key === drawingFor)?.name ?? "역할"}
            busy={Boolean(busy.consent)}
            onAgree={() => void handleConsentAnswer(drawingFor, true, roles.find((r) => r.key === drawingFor)?.name ?? "역할")}
            onObject={() => void handleConsentAnswer(drawingFor, false, roles.find((r) => r.key === drawingFor)?.name ?? "역할")}
          />
        ) : (
          <>
            <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
              결과는 <b>바로 확정되지 않습니다.</b> 배정된 사람이 받아들여야 최종 확정됩니다. 피할 일로
              고른 사람은 추첨 대상에서 뺍니다.
            </p>
            <div className="grid grid-cols-2 gap-[9px]">
              {tools.map((tool) => {
                const on = tool.key === pickedTool?.key;
                return (
                  <button
                    key={tool.key}
                    type="button"
                    onClick={() => setPickedTool(on ? null : tool)}
                    aria-pressed={on}
                    className={cn(
                      "relative flex min-h-[84px] cursor-pointer flex-col items-center justify-center gap-[7px] rounded-2xl border transition-colors duration-150",
                      on ? "border-line-strong bg-yellow-100 text-ink-900" : "border-line bg-card text-txt-strong",
                    )}
                  >
                    {/* 색만으로 "고른 것"을 말하지 않는다(공통 규칙). */}
                    {on ? (
                      <span className="absolute right-2.5 top-2.5 text-yellow-700">
                        <Icon name="check" size={13} />
                      </span>
                    ) : null}
                    <Icon name={tool.icon as IconName} size={24} />
                    <span className="font-bold text-[14px] leading-none">{tool.name}</span>
                  </button>
                );
              })}
            </div>

            {pickedTool ? (
              <div className="mt-4 flex flex-col gap-2">
                {/* **두 길의 가능 여부를 같은 함수로 판한다.** 이미 뽑힌 결과를 다시 덮어쓰는
                    길(무효 재추첨)을 "지금 바로 추첨" 이라고 부르면 누가 그 사실을 알 수 없다 —
                    서버는 조용히 그 자리를 비우고 새 결과로 덮어쓴다. */}
                {canDrawIn(sheetView) ? (
                  <Btn full icon="dices" disabled={busy.draw} onClick={() => void handleDraw(pickedTool)}>
                    지금 바로 추첨
                  </Btn>
                ) : null}
                {/* `voided` 은 제안하지 않는다 — 이미 뽑힌 결과가 있으므로 같은 역할에 두 길이
                    겹치면 어느 쪽인지 모른다(`canProposeIn`). 하나만 떠야 어느 쪽인지 안다. */}
                {canProposeIn(sheetView) ? (
                  <Btn
                    full
                    v="outline"
                    icon="users-round"
                    disabled={busy.propose}
                    onClick={() => void handlePropose(pickedTool)}
                  >
                    팀에 제안하고 동의 받기
                  </Btn>
                ) : null}
                {/* **어느 쪽이 team 에 영향을 주는지 말해 준다.** 누가 누를지 모르는 상황에서
                    고를 수 있어야 하고, 동의가 강제가 아니라는 사실도 같이 알려 준다. */}
                <Note tone="info" icon="users-round" className="mt-1">
                  지금 바로 추첨은 <b>누가 눌렀는지 팀에 알리지 않고</b> 진행됩니다. 팀에 제안하면
                  동의할 때까지 기다리고, 반대하는 사람이 있으면 진행되지 않습니다.
                </Note>
              </div>
            ) : null}
          </>
        )}
      </Sheet>

      <Sheet
        open={inviteOpen}
        title="팀원 초대하기"
        onClose={() => {
          setInviteOpen(false);
          // 나갔다 들어오면 **새로 만든 링크를 다시 못 본다.** 시트를 닫는 순간 그 사실을
          // 명시적으로 받아야, "어디 갔지" 하다가 아무것도 못 찾고 헤매지 않는다.
          setFreshLink(null);
        }}
      >
        <Panel s="yellow" pad={20} className="mb-4 text-center">
          <div className="t-cap-strong mb-2.5 text-yellow-700" style={{ letterSpacing: ".04em" }}>
            초대 코드
          </div>
          <div className="font-mono font-extrabold text-[28px] leading-[1.2] tracking-[.03em] text-ink-900">
            {team.code}
          </div>
        </Panel>
        <div className="flex flex-col gap-2">
          <Btn full icon="copy" onClick={copyInviteCode}>
            코드 복사하기
          </Btn>
          <Btn full v="outline" icon="share-2" onClick={shareInviteLink}>
            초대 링크 공유하기
          </Btn>
        </div>

        <Note tone="info" icon="info" title="코드와 초대 링크는 다릅니다" className="mt-3.5">
          <b>초대 코드</b>는 팀 전체가 나눠 쓰는 값이라 되돌릴 수 없습니다 — 바꾸면 이미 나간
          사람들도 못 들어옵니다. <b>초대 링크</b>는 하나를 만들면 그 공유 하나만 끌 수
          있습니다.
        </Note>

        {isLeader ? (
          <InviteManager
            invites={invites}
            freshLink={freshLink}
            onCreated={setFreshLink}
            onCleared={() => setFreshLink(null)}
          />
        ) : null}
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

/**
 * 팀장의 초대 관리.
 *
 * ## 왜 **링크를 다시 보여줄 수 없는가**
 *
 * 초대 토큰의 원문은 발급할 때 한 번만 나오고 서버에는 해시만 남는다(재입장 코드와 같다).
 * 그래서 이 화면은 링크를 **복사해 주는 일이 없다** — 할 수 있는 일은 "그 공유를 끌까" 뿐이다.
 *
 * 그게 약점으로 보이지만 반대가 맞다. 되돌릴 수 있으려면 **새로 만들어야 하고**, 새 것을
 * 만들지 않고 낡은 링크를 계속 돌리면 그 링크가 살아 있는 시간이 길어질 뿐이다. 새 초대를
 * 만들면 그때 화면이 URL 을 한 번 보여 주고, 닫으면 사라진다.
 *
 * ## 세 값을 고르게 한다
 *
 * 이름 · 몇 명분 · 며칠. **셋 다 없어도 되는 값**으로 두되, 하나를 정하면 그 약속을 지키는
 * 쪽은 화면이다 — "3명분이라면서 네 명이 들어오면 이상하지 않나요" 를 팀장이 듣지 않게.
 */
function InviteManager({
  invites,
  freshLink,
  onCreated,
  onCleared,
}: {
  invites: InviteRow[];
  freshLink: { label: string; url: string } | null;
  onCreated: (link: { label: string; url: string }) => void;
  onCleared: () => void;
}) {
  const { busy, flash, run } = useAction();
  const [label, setLabel] = useState("");
  const [uses, setUses] = useState<string | null>(null);
  const [days, setDays] = useState<string | null>(null);

  const copy = async () => {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink.url);
      flash("초대 링크를 복사했습니다");
    } catch {
      flash("복사하지 못했습니다. 화면의 링크를 직접 옮겨 적어 주세요.");
    }
  };

  const create = () =>
    run(
      "invite",
      async () => {
        const result = await createInviteLink({
          label: label.trim() || null,
          maxUses: uses === null ? null : Number(uses),
          expiresInDays: days === null ? null : Number(days),
        });
        if (!result.ok) {
          // 서버가 던진 오류 문구는 운영 빌드에서 지워진다. **왜 안 됐는지 서버가
          // 돌려주는 값**을 그대로 옮긴다 — 그게 없으면 버튼이 아무 일도 하지 않는다.
          flash(
            result.reason === "long-label"
              ? "이름이 너무 깁니다. 20자 안으로 적어 주세요."
              : "초대를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
          );
          return null;
        }
        const origin = typeof window === "undefined" ? "" : window.location.origin;
        onCreated({ label: result.label ?? "새 초대", url: `${origin}/join?t=${result.token}` });
        setLabel("");
        return "초대를 만들었습니다";
      },
      "초대를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

  const disable = (id: string, name: string) =>
    run(
      "invite",
      async () => {
        const result = await disableInviteLink(id);
        return result === "gone" ? "이미 꺼진 초대입니다" : `“${name}” 초대를 껐습니다`;
      },
      "끄지 못했습니다. 다른 기기에서 이미 꺼졌을 수 있어요.",
    );

  const live = invites.filter((i) => !i.revoked);
  const dead = invites.filter((i) => i.revoked);

  return (
    <div className="mt-4">
      <SecTitle note="공유 한 번마다 하나씩 — 그 공유만 끌 수 있습니다">초대 링크</SecTitle>

      {freshLink ? (
        <Panel s="fill" pad={16} r={16} className="mb-3.5">
          <div className="t-cap-strong mb-1.5 text-txt-muted">{freshLink.label}</div>
          <div className="mb-3 break-all font-mono text-[13px] leading-[1.5] text-txt-strong">
            {freshLink.url}
          </div>
          <Note tone="warn" icon="circle-alert" title="이 링크는 지금 한 번만 보입니다">
            창을 닫으면 다시 볼 수 없습니다 — 서버에는 해시만 남습니다. 나눠 쓰지 못했다면
            새로 만들어 주세요.
          </Note>
          <div className="mt-3 flex gap-2">
            <Btn size="sm" icon="copy" onClick={copy}>
              복사
            </Btn>
            <Btn size="sm" v="outline" onClick={onCleared}>
              확인했습니다
            </Btn>
          </div>
        </Panel>
      ) : null}

      {live.length > 0 ? (
        <Rows className="mb-3.5">
          {live.map((invite) => (
            <div key={invite.id} className="flex items-start gap-[11px] px-[15px] py-[13px]">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                  {invite.label}
                </div>
                <div className="mt-1 flex flex-wrap gap-[5px]">
                  <Chip icon="users-round">
                    {invite.allowed === null
                      ? `${invite.used}명 사용`
                      : `${invite.used} / ${invite.allowed}명`}
                  </Chip>
                  <Chip icon={invite.expiresSoon ? "clock" : "calendar-clock"}>
                    {invite.expiresAt ?? "기한 없음"}
                  </Chip>
                  {invite.allowed !== null && invite.used >= invite.allowed ? (
                    <Chip tone="n" icon="lock">
                      모두 사용됨
                    </Chip>
                  ) : null}
                </div>
                <div className="mt-[9px]">
                  <Btn
                    size="sm"
                    v="outline"
                    icon="x"
                    disabled={busy.invite}
                    onClick={() => disable(invite.id, invite.label)}
                  >
                    이 공유 끄기
                  </Btn>
                </div>
              </div>
            </div>
          ))}
        </Rows>
      ) : (
        <Panel s="fill" pad={16} className="mb-3.5">
          <p className="t-note m-0 text-center text-txt-muted">
            아직 나눈 초대 링크가 없습니다.
          </p>
        </Panel>
      )}

      {dead.length > 0 ? (
        <p className="t-note mb-3.5 text-txt-muted">
          끈 초대 {dead.length}건은 아래에 남습니다. 기록이므로 지우지 않습니다.
        </p>
      ) : null}

      <Input
        value={label}
        onChange={setLabel}
        placeholder="이름 (예: 발표 준비)"
        maxLength={20}
        className="mb-2.5"
      />

      <div className="mb-2.5">
        <div className="t-cap mb-1.5 text-txt-muted">몇 명분</div>
        <div className="flex flex-wrap gap-[6px]">
          <PickChip on={uses === null} onClick={() => setUses(null)}>
            제한 없음
          </PickChip>
          {/* **목록을 여기서 다시 적지 않는다.** 서버가 받아들이는 값은 `USE_CHOICES` 다
              (`server/invite/choices.ts`) — 화면에 나열을 따로 적어 두면 한쪽만 고쳐지고,
              화면에서 고를 수 있는데 서버가 거절하는 값이 남는다(서버가 조용히 자르는
              경로라 "몇 명분" 을 눌렀는데 반영이 안 되는 것으로 보인다). */}
          {USE_CHOICES.map((n) => (
            <PickChip key={n} on={uses === String(n)} onClick={() => setUses(String(n))}>
              {n}명
            </PickChip>
          ))}
        </div>
      </div>

      <div className="mb-3.5">
        <div className="t-cap mb-1.5 text-txt-muted">얼마나 열어 둘까</div>
        <div className="flex flex-wrap gap-[6px]">
          <PickChip on={days === null} onClick={() => setDays(null)}>
            기한 없음
          </PickChip>
          {/* 값은 `EXPIRY_CHOICES` 에서, 사람이 읽을 이름은 여기서. 두 list 다 따로 적으면
              화면에만 고를 수 있는 기한이 생기고, 서버는 조용히 그 값을 자른다. */}
          {EXPIRY_CHOICES.map((d) => (
            <PickChip key={d} on={days === String(d)} onClick={() => setDays(String(d))}>
              {EXPIRY_LABELS[d] ?? `${d}일`}
            </PickChip>
          ))}
        </div>
      </div>

      <Btn full icon="link" disabled={busy.invite} onClick={create}>
        {busy.invite ? "만드는 중…" : "새 초대 만들기"}
      </Btn>
    </div>
  );
}

/** 고르기 한 개. 눌린 쪽만 진하게 — 라디오인데 라디오처럼 보이면 되돌리기 어렵다. */
function PickChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13.5px] leading-none",
        on
          ? "border-line bg-ink-900 font-bold text-white"
          : "border-line bg-card text-txt",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 동의 대기 중인 제안 하나.
 *
 * **목록(07)과 시트가 같은 컴포넌트를 쓴다.** 홈 알림에서 `/team` 으로 들어온 팀원은 역할
 * 행에서 이걸 보고 답해야 하는데, 시트 안에만 있으면 화면 하나를 더 열어야 답할 수 있게
 * 된다 — "답해야 하는데 어디서 답하지"가 생긴다.
 *
 * 여기서 말하는 동의·반대는 **추첨을 시작해도 되는가** 다. 당첨자가 역할을 맡을지 정하는
 * 받기·안 받기와 다른 말이다(`docs/product-language.md`).
 */
function ConsentPanel({
  consent,
  roleLabel,
  busy,
  onAgree,
  onObject,
  compact = false,
}: {
  consent: ConsentView & { kind: "waiting" };
  roleLabel: string;
  busy: boolean;
  onAgree: () => void;
  onObject: () => void;
  compact?: boolean;
}) {
  const waiting = consent.totalMembers - consent.responded;
  return (
    <div className={cn("rounded-xl bg-fill", compact ? "mt-2.5 p-2.5" : "p-4")}>
      <div className={cn("text-[12px] font-semibold text-txt", compact ? "mb-2" : "mb-3")}>
        {roleLabel} 추첨 제안 · {consent.proposedBy}님이 올렸습니다
      </div>

      <div className={cn("flex flex-wrap items-center gap-1.5", compact ? "mb-2" : "mb-3")}>
        <Chip tone="n" icon="dices">
          {consent.tool}
        </Chip>
        <Chip tone="ok" icon="check">
          동의 {consent.agreed}명
        </Chip>
        <Chip tone="warn" icon="clock">
          미응답 {waiting}명
        </Chip>
      </div>

      {compact ? null : (
        <p className="t-note m-0 mb-3 text-txt-muted">
          응답 마감 {consent.respondBy}까지 <b>반대하는 사람이 없으면</b> 추첨할 수 있게 됩니다. 누군가
          반대하면 이 제안은 사라지고, 다시 올려야 합니다.
        </p>
      )}

      {consent.iAgreed ? (
        <Chip tone="ok" icon="check">
          내가 동의함
        </Chip>
      ) : (
        <div className="flex gap-2">
          <Btn size="sm" icon="check" disabled={busy} onClick={onAgree}>
            동의하기
          </Btn>
          <Btn size="sm" v="ghost" icon="x" disabled={busy} onClick={onObject}>
            반대하기
          </Btn>
        </div>
      )}
    </div>
  );
}
