"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppBar, Body, Btn, Chip, Icon, Note, Panel, Rows, Sheet, Toast, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AiPolicy, AiTool } from "@/lib/types";
import { exportAiUsage, getTeamAiSummary } from "@/server/actions/ai";
import type { TeamAiWeeklySummary } from "@/server/ai/call-stats";
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

  const [exporting, setExporting] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [summary, setSummary] = useState<TeamAiWeeklySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!aiReady) return;
    getTeamAiSummary()
      .then((data) => {
        setSummary(data);
        setSummaryError(null);
      })
      .catch((cause: unknown) => {
        console.error("[ai-hub] getTeamAiSummary failed:", cause);
        setSummaryError("최근 AI 도구 상태 지표를 불러오지 못했습니다.");
      });
  }, [aiReady]);

  const downloadUsage = async () => {
    setExporting(true);
    try {
      const { filename, csv } = await exportAiUsage();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      flash("내역을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <AppBar title="AI 도구" sub="팀플에 필요한 만큼만" onBack={() => router.push("/home")} />

      <Body dense>
        {summary && summary.warnings.length > 0 ? (
          <Note tone="warn" icon="circle-alert" title="AI 도구 응답 안내" className="mb-3">
            {summary.warnings.join(" ")}
          </Note>
        ) : null}
        {summaryError ? (
          <Note tone="warn" icon="circle-alert" title="지표 조회 불가" className="mb-3">
            {summaryError}
          </Note>
        ) : null}
        <Note tone="info" icon="shield" className="mb-4">
          <b>AI가 대신 결정하지 않습니다.</b> 초안만 만들고, 팀에 보낼지·고칠지는 사람이 정합니다.
          {aiReady ? " 사실관계·수치는 보내기 전에 확인해 주세요." : null}
        </Note>

        <Rows className="mb-4">
          {tools.map((tool) => {
            const open = tool.href !== null;
            return (
              <button
                key={tool.key}
                type="button"
                disabled={!open}
                onClick={() => open && router.push(tool.href as string)}
                className={cn(
                  "box-border flex min-h-[64px] w-full items-center gap-3 border-none bg-transparent px-[15px] py-3.5 text-left",
                  open ? "cursor-pointer transition-colors duration-150 hover:bg-cr-50" : "cursor-default",
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
                  <span className="text-pretty-keep mt-0.5 block text-[13.5px] leading-[1.5] text-txt-muted">
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
        </Rows>

        {aiReady ? null : <SampleNote className="mb-4" />}

        <Panel s="fill" pad={0} r={18} onClick={() => setPolicyOpen(true)}>
          <span className="flex min-h-[64px] items-center gap-3 px-[15px] py-3">
            <span className="grid size-10 flex-none place-items-center text-txt-muted">
              <Icon name="database" size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-sec keep-all block text-txt-strong">이용 정책·내 기록</span>
              <span className="text-pretty-keep mt-0.5 block text-[13px] leading-[1.5] text-txt-muted">
                입력한 글은 저장하지 않아요. 내역 내려받기도 여기서 해요.
              </span>
            </span>
            <span className="flex-none text-txt-muted">
              <Icon name="chevron-right" size={17} />
            </span>
          </span>
        </Panel>
      </Body>

      <Sheet open={policyOpen} title="AI 이용·보관 정책" onClose={() => setPolicyOpen(false)}>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          <PolicyFact icon="database">입력한 글과 결과는 <b>저장하지 않습니다</b>.</PolicyFact>
          <PolicyFact icon="clock">
            남는 것은 누가 언제 어떤 도구를 썼는지뿐이고, 그 기록은 <b>{policy.retentionDays}일</b>{" "}
            뒤 자동 삭제됩니다.
          </PolicyFact>
          <PolicyFact icon="sparkles">
            <b>하루 사용량 한도는 없습니다.</b>
          </PolicyFact>
        </ul>

        <div className="mt-[18px] border-t border-line pt-3.5">
          <div className="t-sec mb-2.5 text-txt-strong">내려받기</div>
          <div className="flex flex-col gap-2">
            <Btn v="outline" icon="download" full disabled={exporting} onClick={downloadUsage}>
              {exporting ? "내역 만드는 중…" : "AI 사용 내역"}
            </Btn>
          </div>
        </div>
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

function PolicyFact({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-fill text-txt-muted">
        <Icon name={icon} size={16} />
      </span>
      <span className="t-body keep-all pt-0.5 text-txt">{children}</span>
    </li>
  );
}
