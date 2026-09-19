"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Body, Btn, Chip, Icon, Note, Toast, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AiPolicy, AiTool } from "@/lib/types";

/**
 * 14 AI 도구 허브.
 *
 * 제품의 약속 하나가 여기 적혀 있다: **AI 는 초안만 만든다.** 팀에 보낼지, 어떻게 고칠지는
 * 사람이 정한다. 그래서 모든 도구 화면이 결과를 원문과 나란히 보여 준다.
 */
export function AiHubScreen({ tools, policy }: { tools: AiTool[]; policy: AiPolicy }) {
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

        <Note tone="warn" icon="flask-conical" title="아직 AI가 연결되지 않았습니다" className="mt-2.5">
          지금은 어떤 글을 넣어도 <b>미리 적어 둔 샘플 결과</b>가 나옵니다. 화면 흐름을 보기 위한
          것이며, 결과의 품질을 판단할 수 있는 상태가 아닙니다.
        </Note>

        <Note tone="info" icon="database" title="AI 이용·보관 정책" className="mt-2.5">
          대화 내용은 <b>{policy.retentionDays}일</b> 보관 후 자동 삭제됩니다. 학생 팀플 규모를 기준으로
          사용량 한도는 두지 않습니다.
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
