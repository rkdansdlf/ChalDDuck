"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  DrawGame,
  Icon,
  Note,
  Panel,
  Rows,
  SecTitle,
  Sheet,
  Toast,
  type ChipTone,
  type DrawCandidate,
  type IconName,
} from "@/components/ui";
import type { Member, RandomTool, Role, RoleKey, RoleNegotiation, Team } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import { acceptRoleDraw, claimSoleRole, drawForRole, rejectRoleDraw } from "@/server/actions/roles";
import {
  NO_DRAW_POOL_TEXT,
  applyMyChoices,
  canDrawIn,
  drawPoolOf,
  roleViewOf,
  voidedText,
  wantersOf,
  type RoleView,
} from "./roster-model";

/**
 * 상태 칩의 말과 그림.
 *
 * `RoleView`(`roster-model`)와 **한 쌍**이어야 한다 — 상태가 늘어도 칩이 없으면
 * 화면은 조용히 아무것도 그리지 않는다(예전의 "확정" 칩이 그랬다). 여기 두는 이유는
 * 모델이 UI 어휘까지 알 필요가 없도록 하기 위해서다.
 */
const ROLE_VIEW_CHIP: Record<RoleView["kind"], { label: string; tone: ChipTone; icon: IconName }> = {
  empty: { label: "미정", tone: "n", icon: "circle-dashed" },
  auto: { label: "확정 예정", tone: "n", icon: "clock" },
  negotiating: { label: "협의 중", tone: "warn", icon: "circle-alert" },
  awaiting: { label: "수락 대기", tone: "warn", icon: "clock" },
  confirmed: { label: "확정", tone: "ok", icon: "check" },
  voided: { label: "무효", tone: "err", icon: "x" },
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
  rejoinPending,
}: {
  team: Team;
  roles: Role[];
  roster: Member[];
  tools: RandomTool[];
  negotiation: RoleNegotiation;
  /** 팀장이 승인해 줘야 하는 재입장 요청 수. 팀장이 아니면 0. */
  rejoinPending: number;
}) {
  const router = useRouter();
  const onboarding = useOnboarding();
  const { draws, rejected } = negotiation;
  const { toast, busy, flash, run } = useAction();

  /** 추첨 도구를 고르는 중인 역할. */
  const [drawingFor, setDrawingFor] = useState<RoleKey | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  /** 서버 응답을 기다리는 동안 고른 도구 — 다 오면 바로 연출로 넘어간다. */
  const [rollingTool, setRollingTool] = useState<RandomTool | null>(null);
  /** 연출 중인 결과 — 서버가 이미 정한 당첨자를 쥐고 있다가 연출이 끝나면 확정 대기로 넘긴다. */
  const [drawResult, setDrawResult] = useState<{
    tool: RandomTool;
    pool: DrawCandidate[];
    winner: string;
  } | null>(null);

  const roleName = (key: RoleKey | null) => roles.find((r) => r.key === key)?.name ?? "미정";

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

  /** 서버의 `drawPoolOf` 와 같은 규칙으로 연출에 쓸 후보를 고른다. */
  const candidatePoolFor = (role: RoleKey): DrawCandidate[] =>
    drawPoolOf(wantersOf(members, role), role, new Set(excludedIdsOf(role))).pool.map((m) => ({
      name: m.name,
      mbti: m.mbti,
    }));

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
              : "이미 추첨 결과가 나와 있습니다 — 당첨자가 거절해야 다시 뽑을 수 있습니다",
          );
          return;
        }
        setDrawResult({ tool, pool, winner: result.winner });
      },
      "추첨하지 못했습니다. 다시 시도해 주세요.",
    );
    setRollingTool(null);
  };

  /** 연출이 끝난 뒤 시트를 닫고 수락 대기 상태로 넘긴다. */
  const finishDraw = () => {
    const finished = drawResult;
    setDrawResult(null);
    setDrawingFor(null);
    router.refresh();
    if (finished) flash(`${finished.tool.name} 결과를 ${finished.winner}님에게 보냈습니다 — 수락 대기`);
  };

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
        <SecTitle note="희망자 수와 조율 상태입니다">역할별 현황</SecTitle>

        <div className="mb-5 flex flex-col gap-2">
          {roles.map((role) => {
            const wanters = wantersOf(members, role.key);
            const result = draws[role.key];
            const excluded = rejected[role.key] ?? [];
            // 상태 판정은 `roster-model` 한 곳에서. 예전에는 여기서 `clash` 로 직접
            // 조건을 적어, 추첨이 남은 상태인데 아무것도 보이지 않는 상황이 생겼다.
            const view = roleViewOf(wanters.length, result ?? null);
            const status = ROLE_VIEW_CHIP[view.kind];
            const iAmWinner = result !== undefined && myId !== null && result.winnerId === myId;

            return (
              <Panel
                key={role.key}
                s={view.kind === "negotiating" || view.kind === "awaiting" ? "coral" : "card"}
                pad={14}
                r={16}
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="t-sec keep-all text-txt-strong">{role.name}</span>
                  <Chip tone={status.tone} icon={status.icon}>
                    {status.label}
                  </Chip>
                </div>

                <div className="keep-all mt-1 font-medium text-[13px] leading-[1.5] text-txt-muted">
                  {wanters.length === 0
                    ? "아무도 1순위로 고르지 않았습니다"
                    : `희망자 ${wanters.length}명 · ${wanters.map((m) => m.name).join(" · ")}`}
                </div>

                {view.kind === "voided" ? (
                  <p className="t-note m-0 mt-2.5 text-txt-muted">{voidedText(view.winner)}</p>
                ) : null}

                {/* **무효 추첨도 자리를 차지하고 있으므로 추첨 버튼이 살아야 한다.**
                    예전에는 "협의 중" 일 때만 떠서, 갇힌 추첨을 꺼낼 수단이 없었다. */}
                {canDrawIn(view) ? (
                  <div className="mt-2.5 flex flex-wrap gap-[7px]">
                    {view.kind === "negotiating" ? (
                      <Btn
                        size="sm"
                        icon="messages-square"
                        // 이야기는 단톡방에서 한다. 앱이 대신 안내문을 올리지는 않는다 —
                        // 예전에는 "올렸습니다" 토스트만 뜨고 실제로는 아무것도 올라가지 않았다.
                        onClick={() => router.push("/chat/team")}
                      >
                        이야기해서 정하기
                      </Btn>
                    ) : null}
                    <Btn size="sm" v="outline" icon="dices" onClick={() => setDrawingFor(role.key)}>
                      {view.kind === "voided" ? "다시 추첨하기" : "협의가 안 되면 추첨하기"}
                    </Btn>
                  </div>
                ) : null}

                {wanters.length === 1 && !result ? (
                  <div className="mt-2.5">
                    <Btn
                      size="sm"
                      icon="check"
                      disabled={busy.claim}
                      onClick={() =>
                        void run(
                          "claim",
                          async () => {
                            const answer = await claimSoleRole(role.key);
                            router.refresh();
                            return answer === "ok"
                              ? `${role.name} 맡기로 정했습니다`
                              : "이 역할은 이미 정해졌거나 다른 사람이 고른 역할입니다";
                          },
                          "정하지 못했습니다. 다시 눌러 주세요.",
                        )
                      }
                    >
                      {wanters[0].isMe ? "이 역할 맡기" : `${wanters[0].name}님에게 맡기기`}
                    </Btn>
                  </div>
                ) : null}

                {view.kind === "awaiting" && result ? (
                  <div className="mt-2.5">
                    <div className="mb-2 flex flex-wrap gap-[5px]">
                      <Chip tone="warn" icon="circle-dashed">
                        {ROLE_VIEW_CHIP[view.kind].label}
                      </Chip>
                    </div>
                  </div>
                ) : null}

                {clash && result && !result.accepted ? (
                  <div className="mt-2.5">
                    <div className="mb-2 flex flex-wrap gap-[5px]">
                      <Chip tone="warn" icon="circle-dashed">
                        {result.tool} 결과 · {result.winner}님에게 후보 확인 요청
                      </Chip>
                      {excluded.map((name) => (
                        <Chip key={name} tone="err" icon="x">
                          {name} 제외됨
                        </Chip>
                      ))}
                    </div>
                    {/* 수락·거절은 당첨자 본인만 한다 — 서버도 같은 규칙으로 막는다.
                        판정은 id 로 한다(이름은 고칠 수 있으므로). */}
                    {iAmWinner ? (
                      <div className="flex flex-wrap gap-[7px]">
                        {/* 둘 다 `disabled` 로 잠근다 — 수락과 거절이 거의 동시에 닿으면
                            서버의 조건부 갱신 중 하나가 0 행을 맞고도 성공한 척한다. */}
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
                              "수락하지 못했습니다. 다시 시도해 주세요.",
                            )
                          }
                        >
                          수락하기
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
                                  ? "다음 추첨에서 제외됩니다 — 팀원이 다시 추첨할 수 있습니다"
                                  : "이미 정리된 추첨입니다";
                              },
                              "거절하지 못했습니다. 다시 시도해 주세요.",
                            )
                          }
                        >
                          거절하기
                        </Btn>
                      </div>
                    ) : (
                      <p className="t-note m-0 text-txt-muted">
                        {result.winner}님이 수락하거나 거절하면 정해집니다.
                      </p>
                    )}
                  </div>
                ) : null}

                {view.kind === "confirmed" ? (
                  <div className="mt-2">
                    <Chip tone="ok" icon="check">
                      확정 · {view.winner}
                    </Chip>
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>

        <Note tone="info" icon="list-ordered" className="mb-5">
          조율 순서: <b>선호 확인 → 협의 → (필요하면) 추첨 → 당사자 수락 → 최종 확정</b>. 거절은 오류가
          아니라 남은 후보끼리 다시 추첨하는 정상 절차입니다. 이 과정 어디에도 MBTI는 쓰이지 않습니다.
        </Note>

        <SecTitle
          note="각자 본인이 직접 고른 값입니다 · 아바타를 누르면 1:1 대화가 열립니다"
        >
          팀원별 선호
        </SecTitle>
        <Rows>
          {members.map((member) => (
            <div key={member.id} className="flex min-h-[56px] items-start gap-3 px-[15px] py-[13px]">
              <button
                type="button"
                disabled={member.isMe}
                aria-label={member.isMe ? undefined : `${member.name}님과 대화하기`}
                // DM 스레드 id 는 상대 팀원의 id 다(`getDmThreads`).
                onClick={() => router.push(`/chat/dm/${member.id}`)}
                className={`flex-none border-none bg-transparent p-0 ${
                  member.isMe ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <Avatar name={member.name} mbti={member.mbti} size={38} />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="t-sec text-txt-strong">{member.name}</span>
                  {member.isMe ? (
                    <span className="t-cap-strong text-yellow-700">나</span>
                  ) : null}
                </div>

                {member.want ? (
                  <div className="mt-1.5 flex flex-wrap gap-[5px]">
                    <Chip tone="want" icon="thumbs-up">
                      희망 · {roleName(member.want)}
                    </Chip>
                    {member.veto ? (
                      <Chip tone="veto" icon="hand">
                        피함 · {roleName(member.veto)}
                      </Chip>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <Chip icon="circle-dashed">아직 고르지 않음</Chip>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Rows>

        <SecTitle className="mt-5" note="합의한 역할과 실제 수행 내역만 모읍니다">기여 기록</SecTitle>
        <Btn
          full
          v="outline"
          icon="clipboard-check"
          iconRight="chevron-right"
          onClick={() => router.push("/team/contrib")}
        >
          내 기여 기록 확인하기
        </Btn>

        <SecTitle
          className="mt-5"
          note="가입·재입장 승인 · 내 기기 · 재입장 코드"
        >
          계정과 기기
        </SecTitle>
        <Btn
          v="outline"
          size="sm"
          icon="lock"
          iconRight="chevron-right"
          onClick={() => router.push("/team/access")}
        >
          {rejoinPending > 0 ? `승인할 요청 ${rejoinPending}건 확인하기` : "계정과 기기 관리"}
        </Btn>

        <SecTitle className="mt-5" note="가볍게 분위기를 푸는 도구들">팀 친목</SecTitle>
        <div className="flex flex-wrap gap-2">
          <Btn v="outline" size="sm" icon="drama" onClick={() => router.push("/team/icebreak")}>
            아이스브레이킹
          </Btn>
          <Btn v="outline" size="sm" icon="disc-3" onClick={() => router.push("/team/roulette")}>
            메뉴 룰렛
          </Btn>
        </div>
      </Body>

      <Sheet
        open={drawingFor !== null}
        title={rollingTool || drawResult ? undefined : "추첨 방식 고르기"}
        onClose={() => {
          // 연출이 도는 동안은 결과를 끝까지 보게 한다 — 도중에 닫아도 서버 결과는 이미 저장돼 있다.
          if (rollingTool || drawResult) return;
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
        ) : (
          <>
            <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
              결과는 <b>바로 확정되지 않습니다.</b> 배정된 사람이 수락해야 최종 확정됩니다. Veto로 고른
              사람은 추첨 대상에서 뺍니다.
            </p>
            <div className="grid grid-cols-2 gap-[9px]">
              {tools.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  onClick={() => handleDraw(tool)}
                  className="flex min-h-[84px] cursor-pointer flex-col items-center justify-center gap-[7px] rounded-2xl border border-line bg-card text-txt-strong"
                >
                  <Icon name={tool.icon as IconName} size={24} />
                  <span className="font-bold text-[14px] leading-none">{tool.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={inviteOpen} title="팀원 초대하기" onClose={() => setInviteOpen(false)}>
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
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}
