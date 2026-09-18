"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  Icon,
  Note,
  Panel,
  Rows,
  SecTitle,
  Sheet,
  Toast,
  type ChipTone,
  type IconName,
} from "@/components/ui";
import type { Member, RandomTool, Role, RoleKey, Team } from "@/lib/types";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import {
  acceptDraw,
  drawFor,
  rejectDraw,
  setPendingCount,
  useNegotiation,
} from "./negotiation-state";

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
}: {
  team: Team;
  roles: Role[];
  roster: Member[];
  tools: RandomTool[];
}) {
  const onboarding = useOnboarding();
  const { resolutions, rejected } = useNegotiation();

  /** 추첨 도구를 고르는 중인 역할. */
  const [drawingFor, setDrawingFor] = useState<RoleKey | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const roleName = (key: RoleKey | null) => roles.find((r) => r.key === key)?.name ?? "미정";

  /** 서버 명단 위에 내가 방금 온보딩에서 고른 값을 덮어쓴다. */
  const members = useMemo(
    () =>
      roster.map((m) =>
        m.isMe
          ? {
              ...m,
              name: onboarding.name.trim() || m.name,
              mbti: onboarding.effectiveMbti ?? m.mbti,
              want: onboarding.want ?? m.want,
              veto: onboarding.veto ?? m.veto,
            }
          : m,
      ),
    [roster, onboarding.name, onboarding.effectiveMbti, onboarding.want, onboarding.veto],
  );

  /** 아직 확정되지 않은, 희망자가 겹친 역할 수. */
  const pending = useMemo(
    () =>
      roles.filter(
        (r) =>
          members.filter((m) => m.want === r.key).length > 1 && !resolutions[r.key]?.accepted,
      ).length,
    [roles, members, resolutions],
  );

  useEffect(() => {
    setPendingCount(pending);
  }, [pending]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const handleDraw = (tool: RandomTool) => {
    if (!drawingFor) return;
    const candidates = members.filter((m) => m.want === drawingFor).map((m) => m.name);
    const winner = drawFor(drawingFor, tool.name, candidates);
    setDrawingFor(null);
    if (winner) flash(`${tool.name} 결과를 ${winner}님에게 보냈습니다 — 수락 대기`);
  };

  return (
    <>
      <AppBar title="역할 조율" sub={team.name} action="user-plus" actionLabel="팀원 초대하기" />
      <Body dense>
        <SecTitle note="희망자 수와 조율 상태입니다">역할별 현황</SecTitle>

        <div className="mb-5 flex flex-col gap-2">
          {roles.map((role) => {
            const wanters = members.filter((m) => m.want === role.key);
            const result = resolutions[role.key];
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
                      onClick={() => flash("팀 채팅에 조율 안내를 올렸습니다")}
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
                        onClick={() => {
                          acceptDraw(role.key);
                          flash("확정되었습니다");
                        }}
                      >
                        {result.winner}님이 수락
                      </Btn>
                      <Btn
                        size="sm"
                        v="ghost"
                        icon="x"
                        onClick={() => {
                          const who = rejectDraw(role.key);
                          if (who) flash(`${who}님을 다음 추첨에서 제외합니다 — 다시 추첨해 주세요`);
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

        <SecTitle note="각자 본인이 직접 고른 값입니다 · 아바타를 누르면 1:1 대화가 열립니다">
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
      </Body>

      <Sheet open={drawingFor !== null} title="추첨 방식 고르기" onClose={() => setDrawingFor(null)}>
        <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
          결과는 <b>바로 확정되지 않습니다.</b> 배정된 사람이 수락해야 최종 확정됩니다. Veto로 고른 사람은
          추첨 대상에서 뺍니다.
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
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}
