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
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import { acceptRoleDraw, drawForRole, rejectRoleDraw } from "@/server/actions/roles";
import { applyMyChoices, wantersOf } from "./roster-model";

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

  /** 추첨 도구를 고르는 중인 역할. */
  const [drawingFor, setDrawingFor] = useState<RoleKey | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

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

  /** 같은 역할을 1순위로 고른 사람 중 이미 거절한 사람을 뺀 후보 — 서버의 후보 계산과 같은 규칙. */
  const candidatePoolFor = (role: RoleKey): DrawCandidate[] => {
    const wanters = wantersOf(members, role);
    const excluded = rejected[role] ?? [];
    const pool = wanters.filter((m) => !excluded.includes(m.name));
    return (pool.length > 0 ? pool : wanters).map((m) => ({ name: m.name, mbti: m.mbti }));
  };

  /**
   * 당첨자는 서버가 고른다 — 화면에서 뽑아 보내면 누구나 자기를 적어 보낼 수 있다.
   * 응답이 오면 바로 닫지 않고, 정해진 당첨자를 쥔 채로 도구별 연출을 먼저 보여 준다.
   */
  const handleDraw = async (tool: RandomTool) => {
    if (!drawingFor) return;
    const pool = candidatePoolFor(drawingFor);
    setRollingTool(tool);
    const result = await drawForRole(drawingFor, tool.name);
    setRollingTool(null);
    if (!result) {
      flash("추첨할 사람이 없습니다");
      return;
    }
    setDrawResult({ tool, pool, winner: result.winner });
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
            const clash = wanters.length > 1;
            const excluded = rejected[role.key] ?? [];

            const status: { label: string; tone: ChipTone; icon: IconName } =
              wanters.length === 0
                ? { label: "미정", tone: "n", icon: "circle-dashed" }
                : result?.accepted
                  ? { label: "확정", tone: "ok", icon: "check" }
                  : clash
                    ? { label: "협의 중", tone: "warn", icon: "circle-alert" }
                    : { label: "확정 예정", tone: "n", icon: "clock" };

            return (
              <Panel
                key={role.key}
                s={clash && !result?.accepted ? "coral" : "card"}
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

                {clash && !result ? (
                  <div className="mt-2.5 flex flex-wrap gap-[7px]">
                    <Btn
                      size="sm"
                      icon="messages-square"
                      // 이야기는 단톡방에서 한다. 앱이 대신 안내문을 올리지는 않는다 —
                      // 예전에는 "올렸습니다" 토스트만 뜨고 실제로는 아무것도 올라가지 않았다.
                      onClick={() => router.push("/chat/team")}
                    >
                      이야기해서 정하기
                    </Btn>
                    <Btn size="sm" v="outline" icon="dices" onClick={() => setDrawingFor(role.key)}>
                      협의가 안 되면 추첨하기
                    </Btn>
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
                    <div className="flex flex-wrap gap-[7px]">
                      <Btn
                        size="sm"
                        icon="check"
                        onClick={async () => {
                          await acceptRoleDraw(role.key);
                          router.refresh();
                          flash("확정되었습니다");
                        }}
                      >
                        {result.winner}님이 수락
                      </Btn>
                      <Btn
                        size="sm"
                        v="ghost"
                        icon="x"
                        onClick={async () => {
                          const rejectedMember = await rejectRoleDraw(role.key);
                          router.refresh();
                          if (rejectedMember) {
                            flash(`${rejectedMember.winner}님을 다음 추첨에서 제외합니다 — 다시 추첨해 주세요`);
                          }
                        }}
                      >
                        {result.winner}님이 거절
                      </Btn>
                    </div>
                  </div>
                ) : null}

                {clash && result?.accepted ? (
                  <div className="mt-2">
                    <Chip tone="ok" icon="check">
                      확정 · {result.winner}
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
                // TODO(31 DM 화면): 구현되면 여기서 해당 대화로 이동한다
                onClick={() => flash("1:1 대화는 아직 준비 중입니다")}
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
