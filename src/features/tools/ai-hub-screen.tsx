"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Body, Btn, Chip, Icon, Note, Toast, Undecided, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AiPolicy, AiTool } from "@/lib/types";
import { SampleNote } from "./ai-state-notes";

/**
 * 14 AI 도구 허브.
 *
 * 제품의 약속 하나가 여기 적혀 있다: **AI 는 초안만 만든다.** 팀에 보낼지, 어떻게 고칠지는
 * 사람이 정한다. 그래서 모든 도구 화면이 결과를 원문과 나란히 보여 준다.
 */
export function AiHubScreen({
  tools,
  policy,
  aiReady,
}: {
  tools: AiTool[];
  policy: AiPolicy;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  return (
    <>
      <AppBar title="AI 도구" sub="팀플에 필요한 만큼만" onBack={() => router.push("/home")} />

      <Body dense>
        <div className="mb-4 flex flex-col gap-[9px]">
          {tools.map((tool) => {
            const open = tool.ready && tool.href !== null;
            return (
              <button
                key={tool.key}
                type="button"
                disabled={!open}
                onClick={() => open && router.push(tool.href as string)}
                className={cn(
                  "box-border flex min-h-[56px] w-full items-center gap-3 rounded-[18px] px-[15px] py-3.5 text-left",
                  open
                    ? "cursor-pointer border border-line bg-card"
                    : "cursor-default border border-transparent bg-fill",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 flex-none place-items-center rounded-[13px]",
                    open ? "bg-coral-100 text-coral-700" : "bg-transparent text-txt-faint",
                  )}
                >
                  <Icon name={tool.icon as IconName} size={19} />
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn("t-sec keep-all block", open ? "text-txt-strong" : "text-txt-muted")}
                  >
                    {tool.name}
                  </span>
                  <span className="text-pretty-keep mt-[3px] block text-[13.5px] leading-[1.5] text-txt-muted">
                    {tool.note}
                  </span>
                </span>

                {open ? (
                  <span className="flex-none text-txt-muted">
                    <Icon name="chevron-right" size={17} />
                  </span>
                ) : (
                  <Chip icon="circle-dashed">준비 중</Chip>
                )}
              </button>
            );
          })}
        </div>

        <Note tone="info" icon="shield" title="AI가 대신 결정하지 않습니다">
          도구는 <b>초안만</b> 만듭니다. 팀에 보낼지, 어떻게 고칠지는 사람이 정합니다. 보내기 전 항상
          원문과 나란히 보여줍니다.
        </Note>

        {aiReady ? (
          <Note tone="info" icon="sparkles" title="결과는 AI가 만든 초안입니다" className="mt-2.5">
            사실관계·수치는 <b>사람이 확인해야</b> 합니다. 리서처는 웹에서 찾은 자료만 보여 주고,
            출처가 없는 결과는 올리지 않습니다.
          </Note>
        ) : (
          <SampleNote className="mt-2.5" />
        )}

        <Note tone="info" icon="database" title="AI 이용·보관 정책" className="mt-2.5">
          입력한 글과 결과는 <b>저장하지 않습니다</b>. 남는 것은 누가 언제 어떤 도구를 썼는지뿐이고,
          그 기록도 <b>{policy.retentionDays}일</b> 뒤 자동 삭제됩니다. 하루에 쓸 수 있는 횟수는 팀{" "}
          {policy.perTeamPerDay}회 · 한 사람 {policy.perMemberPerDay}회입니다.
          <Undecided>
            한도 수치(팀 {policy.perTeamPerDay}회 · 1인 {policy.perMemberPerDay}회)는 기획안에 없어
            임시로 정한 값 — 호출마다 비용이 들어 한도를 아예 두지 않을 수는 없어 넉넉한 쪽으로 잡았다.
            수업에서 실제로 얼마나 쓰는지 보고 확정할 것.
          </Undecided>
          <span className="mt-2.5 block">
            <Btn
              size="sm"
              v="outline"
              icon="download"
              onClick={() => flash("AI 사용 내역 내려받기는 아직 준비 중입니다")}
            >
              AI 사용 내역 내려받기
            </Btn>
          </span>
        </Note>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
