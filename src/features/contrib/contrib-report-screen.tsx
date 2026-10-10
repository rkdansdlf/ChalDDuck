"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Dock,
  Icon,
  Note,
  Panel,
  Sheet,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ContribReportRow, Team } from "@/lib/types";
import { createReportShareToken } from "@/server/actions/report-share";

export type ReportViewMode = "professor" | "internal";

/**
 * 18 기여 기록 · 1장 PDF 및 보고서 화면.
 *
 * 두 가지 뷰 모드 지원:
 * - "professor": 교수 제출용 공식 양식 (확인된 실적, 상호 확인율 %, 주요 활동 하이라이트 중심)
 * - "internal": 팀 내부 점검용 양식 (미확인 건수, 의견 차이, 다툼 이력 등 전수 포함)
 */
export function ContribReportScreen({
  team,
  rows,
  issuedOn,
}: {
  team: Team;
  rows: ContribReportRow[];
  issuedOn: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ReportViewMode>("professor");
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingGuardOpen, setPendingGuardOpen] = useState(false);

  const totalConfirmed = rows.reduce((acc, r) => acc + r.confirmed, 0);
  const totalPending = rows.reduce((acc, r) => acc + r.pending, 0);
  const totalDisputed = rows.reduce((acc, r) => acc + r.disputed, 0);
  const totalAll = totalConfirmed + totalPending + totalDisputed;
  const consensusRate = totalAll > 0 ? Math.round((totalConfirmed / totalAll) * 100) : 100;

  const handlePrint = () => {
    if (totalPending > 0 || totalDisputed > 0) {
      setPendingGuardOpen(true);
      return;
    }
    printAs(`기여기록_리포트_${team.name}_${issuedOn}`);
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const res = await createReportShareToken(mode);
      const fullUrl = `${window.location.origin}${res.url}`;
      setShareUrl(fullUrl);
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      alert("공유 링크를 생성하지 못했습니다.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <AppBar
        title="기여 기록 리포트"
        sub={mode === "professor" ? "교수 제출용 공식 서식" : "팀 내부 점검용"}
        onBack={() => router.push("/team/contrib")}
      />

      <Body dense>
        {/* 모드 선택 탭 (인쇄 제외) */}
        <div className="mb-3.5 flex rounded-xl border border-line bg-fill p-1">
          <button
            type="button"
            onClick={() => setMode("professor")}
            className={cn(
              "flex-1 rounded-lg py-2 text-[13px] font-bold transition-all cursor-pointer",
              mode === "professor"
                ? "bg-card text-txt-strong shadow-xs"
                : "text-txt-muted hover:text-txt",
            )}
          >
            🎓 교수 제출용 (공식)
          </button>
          <button
            type="button"
            onClick={() => setMode("internal")}
            className={cn(
              "flex-1 rounded-lg py-2 text-[13px] font-bold transition-all cursor-pointer",
              mode === "internal"
                ? "bg-card text-txt-strong shadow-xs"
                : "text-txt-muted hover:text-txt",
            )}
          >
            🔍 팀 내부 점검용
          </button>
        </div>

        {/* 상단 요약 배너 (인쇄 제외) */}
        <div className="mb-3.5 rounded-control border border-line bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-bold text-txt-strong">
              {mode === "professor" ? "공식 제출 요약 지표" : "제출 전 내부 점검 상태"}
            </span>
            <Chip tone="ok">상호 확인율 {consensusRate}%</Chip>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2 text-[12.5px]">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <Icon name="check" size={13} />
              확인 완료 {totalConfirmed}건
            </span>
            {totalPending > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                <Icon name="circle-dashed" size={13} />
                미확인 {totalPending}건
              </span>
            ) : null}
            {totalDisputed > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-red-700">
                <Icon name="circle-alert" size={13} />
                의견 차이 {totalDisputed}건
              </span>
            ) : null}
          </div>

          {mode === "professor" && (totalPending > 0 || totalDisputed > 0) && (
            <div className="mt-2 text-[11.5px] leading-relaxed text-amber-800">
              💡 미확인 건은 공식 제출본에서 상호 합의율에 반영되며 감정적 분쟁 세부 내용은 배제됩니다.
            </div>
          )}
        </div>

        {/* ── 리포트 인쇄 문서 (data-print-doc) ──────────────── */}
        <div
          data-print-doc
          className="mb-4 rounded-control border border-line bg-white px-5 py-6 lg:mx-auto lg:min-h-[792px] lg:w-[600px] lg:px-8 lg:py-10 shadow-xs"
        >
          {/* 공식 문서 헤더 */}
          <div className="border-b-2 border-ink-900 pb-3.5">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-600">
                  {mode === "professor" ? "과제 수행 기여 기록 증빙서" : "팀 내부 기여 기록 점검표"}
                </span>
                <h1 className="mt-1 font-extrabold text-[20px] leading-tight text-ink-900">
                  {team.name}
                </h1>
                <p className="mt-0.5 text-[13px] text-zinc-600 font-medium">
                  교과목: {team.course}
                </p>
              </div>
              <div className="text-right text-[12px] text-zinc-500">
                <div>발행일: {issuedOn}</div>
                <div>참여 인원: {rows.length}명</div>
                <div className="mt-1 font-bold text-emerald-800">
                  상호 확인율: {consensusRate}%
                </div>
              </div>
            </div>
          </div>

          {/* 팀원별 기여 내역 */}
          <div className="divide-y divide-zinc-200">
            {rows.map((row) => (
              <div key={row.memberId} className="py-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[15px] text-ink-900">{row.who}</span>
                    {row.left && (
                      <span className="rounded bg-zinc-100 px-1 text-[11px] text-zinc-400">퇴장</span>
                    )}
                    <span className="text-[13px] text-zinc-500 font-medium">
                      역할: {row.role}
                    </span>
                  </div>
                  <span className="text-[12.5px] font-semibold text-emerald-700">
                    확인된 실적 {row.confirmed}건
                  </span>
                </div>

                {/* 칩 지표 */}
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px]">
                  {row.participations > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-zinc-700">
                      <Icon name="users-round" size={11} />
                      팀장 회의 참여 {row.participations}회
                    </span>
                  )}
                  {mode === "internal" && row.pending > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                      미확인 {row.pending}건
                    </span>
                  )}
                  {mode === "internal" && row.disputed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-rose-700">
                      의견 차이 {row.disputed}건
                    </span>
                  )}
                  {mode === "internal" && row.unresolved > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-rose-700">
                      미해결 {row.unresolved}건
                    </span>
                  )}
                </div>

                {/* 주요 성과 하이라이트 */}
                {row.highlights && row.highlights.length > 0 && (
                  <div className="mt-2 rounded bg-zinc-50 px-2.5 py-1.5 text-[12px] text-zinc-700">
                    <div className="font-semibold text-zinc-500 text-[11px] mb-1">교차 확인된 주요 성과</div>
                    <ul className="list-inside list-disc space-y-0.5 text-zinc-700">
                      {row.highlights.map((h, i) => (
                        <li key={i} className="truncate">{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 공적 서명 및 사실 확인 조항 */}
          <div className="mt-6 border-t border-zinc-300 pt-4 text-[12px] leading-relaxed text-zinc-600">
            <p className="font-semibold text-zinc-800">
              ※ 본 보고서는 팀원 상호 검증 및 교차 확인을 거친 기록만을 바탕으로 공정하게 집계되었습니다.
            </p>
            <p className="mt-1 text-zinc-500">
              개인적인 평점, 친목 활동, 채팅 빈도 등 주관적 지표는 배제되었으며, 상호 합의된 역할 배정과 산출물 제출 이력에 기반합니다.
            </p>
            <div className="mt-4 flex justify-between text-[11px] text-zinc-400">
              <span>찰떡(ChalDduck) 객관적 팀플 기여 기록 인증 시스템</span>
              <span>확인자: {team.name} 팀원 일동</span>
            </div>
          </div>
        </div>

        {/* 공유 링크 안내 카드 */}
        {shareUrl && (
          <Panel s="yellow" pad={14} className="mb-3">
            <div className="flex items-center justify-between text-[13px] font-bold text-ink-900">
              <span>공개 열람 링크 (14일 유효)</span>
              {copied && <span className="text-emerald-700 text-[12px]">✓ 클립보드에 복사됨!</span>}
            </div>
            <div className="mt-1 text-[12px] text-txt-muted break-all font-mono">
              {shareUrl}
            </div>
          </Panel>
        )}

        <Note tone="info" icon="shield" className="mb-3">
          인쇄 시 상단 탭 및 모바일 UI는 자동 제외되며, 깔끔한 A4 1장 공문서 규격으로 인쇄됩니다.
        </Note>
      </Body>

      <Dock>
        <div className="flex gap-2">
          <Btn
            v="outline"
            className="flex-1"
            icon={copied ? "check" : "share-2"}
            disabled={sharing}
            onClick={handleShare}
          >
            {copied ? "링크 복사 완료" : "교수용 링크 복사"}
          </Btn>
          <Btn
            v="primary"
            className="flex-1"
            icon="file-down"
            onClick={handlePrint}
          >
            PDF로 저장
          </Btn>
        </div>
      </Dock>

      <Sheet
        open={pendingGuardOpen}
        title="미확인 기록이 남아 있습니다"
        onClose={() => setPendingGuardOpen(false)}
      >
        <p className="text-pretty-keep m-0 mb-3 text-[14px] leading-relaxed text-txt">
          현재 리포트에 <b>미확인 {totalPending}건</b>
          {totalDisputed > 0 ? (
            <>
              , <b>의견 차이 {totalDisputed}건</b>
            </>
          ) : null}
          이 포함되어 있습니다.
        </p>
        <Note tone="warn" icon="circle-alert" className="mb-4">
          팀원 교차 확인이 완료되지 않은 기록은 공식 보고서에서 미확인 상태로 집계되며, 상호 확인율({consensusRate}%)이 낮아질 수 있습니다.
        </Note>
        <div className="flex flex-col gap-2">
          <Btn
            full
            v="primary"
            onClick={() => {
              setPendingGuardOpen(false);
              router.push("/team/contrib/members");
            }}
          >
            팀원 확인하러 가기
          </Btn>
          <Btn
            full
            v="outline"
            onClick={() => {
              setPendingGuardOpen(false);
              printAs(`기여기록_리포트_${team.name}_${issuedOn}`);
            }}
          >
            현재 상태로 PDF 출력하기
          </Btn>
        </div>
      </Sheet>
    </>
  );
}

function printAs(title: string) {
  const previous = document.title;
  document.title = title;
  window.addEventListener("afterprint", () => (document.title = previous), { once: true });
  window.print();
}
