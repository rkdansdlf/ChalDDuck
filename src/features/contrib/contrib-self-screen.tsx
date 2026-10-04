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
  Rows,
  SecTitle,
  Sheet,
  type IconName,
} from "@/components/ui";
import type { ContribKind, ContribRecord, TeamCheckRecord } from "@/lib/types";
import { ContribRow } from "./contrib-row";

/**
 * 16 기여 기록 · 본인 확인.
 *
 * 제품의 약속: **점수나 순위를 만들지 않는다.** 확정된 역할과 실제 수행 내역만 모으고,
 * MBTI·채팅량·친목은 기여 기록에 넣지 않는다.
 */
export function ContribSelfScreen({
  records,
  kinds,
  teamRecords = [],
}: {
  records: ContribRecord[];
  kinds: ContribKind[];
  teamRecords?: TeamCheckRecord[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);

  // 팀 전체 준비 상태 집계
  const totalTeam = teamRecords.length;
  const confirmedTeam = teamRecords.filter((r) => r.state === "ok").length;
  const toCheckCount = teamRecords.filter(
    (r) => !r.isMine && !r.iConfirmed && r.state !== "disputed" && !r.confirmBlockedBy,
  ).length;
  const disputedCount = teamRecords.filter((r) => r.state === "disputed").length;

  // 내 기록: 대기/의견 차이 vs 확인 완료 분리
  const actionRequiredRecords = records.filter((r) => r.state !== "ok");
  const confirmedRecords = records.filter((r) => r.state === "ok");

  return (
    <>
      <AppBar
        title="기여 기록 허브"
        sub="기여 증빙 및 제출 준비"
        onBack={() => router.push("/team")}
      />

      <Body dense>
        {/* 상단 진행 상태 대시보드 */}
        <div className="mb-4 rounded-control border border-line bg-card p-4 shadow-2xs">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-bold text-[14px] text-txt-strong">
              제출 준비 {confirmedTeam} / {totalTeam}건 완료
            </span>
            <span className="font-semibold text-[12px] text-txt-muted">
              {totalTeam > 0 ? `${Math.round((confirmedTeam / totalTeam) * 100)}%` : "0%"}
            </span>
          </div>

          <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${totalTeam > 0 ? (confirmedTeam / totalTeam) * 100 : 0}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 text-[12.5px] text-txt-muted">
            <span>
              팀원 확인 필요 {toCheckCount}건 · 의견 조정 {disputedCount}건
            </span>
            {toCheckCount > 0 ? (
              <button
                type="button"
                onClick={() => router.push("/team/contrib/members")}
                className="cursor-pointer font-bold text-ink-900 underline underline-offset-2 hover:opacity-80"
              >
                확인할 기록 {toCheckCount}건 보기 →
              </button>
            ) : null}
          </div>
        </div>

        {/* 확인 대기 및 조율 중인 내 기록 */}
        <SecTitle note="팀원 확인을 기다리거나 조율 중인 항목입니다">
          확인 대기 중인 내 기록 {actionRequiredRecords.length}건
        </SecTitle>

        {actionRequiredRecords.length > 0 ? (
          <Rows className="mb-3">
            {actionRequiredRecords.map((record) => (
              <ContribRow key={record.id} record={record} kinds={kinds} />
            ))}
          </Rows>
        ) : (
          <div className="mb-3 rounded-control border border-dashed border-line bg-card/50 p-4 text-center text-[13px] text-txt-muted">
            확인 대기 중인 기록이 없습니다. 모두 확인되었거나 새로운 작업을 추가할 수 있습니다.
          </div>
        )}

        {/* 확인 완료된 내 기록 (접을 수 있음) */}
        {confirmedRecords.length > 0 ? (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setShowConfirmed((prev) => !prev)}
              className="flex w-full cursor-pointer items-center justify-between py-2 text-[13px] font-semibold text-txt-muted hover:text-txt-strong"
            >
              <span>확인 완료된 기록 {confirmedRecords.length}건</span>
              <span className="flex items-center gap-1 text-[12px]">
                {showConfirmed ? "접기" : "펼치기"}
                <Icon name={showConfirmed ? "chevron-up" : "chevron-down"} size={14} />
              </span>
            </button>

            {showConfirmed ? (
              <Rows className="mt-1">
                {confirmedRecords.map((record) => (
                  <ContribRow key={record.id} record={record} kinds={kinds} />
                ))}
              </Rows>
            ) : null}
          </div>
        ) : null}

        <Btn v="outline" full icon="plus" className="mb-3.5" onClick={() => setAdding(true)}>
          공동·오프라인 작업 추가
        </Btn>

        <Note tone="info" icon="users-round" className="mb-3.5">
          회의 참여는 <b>팀장이 직접 표시합니다</b>(자동 판정하지 않습니다).
          팀원들의 교차 확인 내역은 상단 바로가기를 통해 확인하실 수 있습니다.
        </Note>
      </Body>

      <Dock>
        <div className="flex w-full gap-2">
          {toCheckCount > 0 ? (
            <Btn
              v="outline"
              size="lg"
              className="flex-1"
              onClick={() => router.push("/team/contrib/members")}
            >
              팀원 확인 ({toCheckCount})
            </Btn>
          ) : null}
          <Btn
            full={toCheckCount === 0}
            size="lg"
            className="flex-1"
            iconRight="arrow-right"
            onClick={() => router.push("/team/contrib/report")}
          >
            제출용 리포트 보기
          </Btn>
        </div>
      </Dock>

      <Sheet open={adding} title="빠진 작업 추가" onClose={() => setAdding(false)}>
        <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
          앱 밖에서 한 일도 기록에 넣을 수 있습니다. 추가한 항목은 팀원 확인을 거칩니다.
        </p>
        <div className="mb-4 flex flex-col gap-2">
          {kinds.map((kind) => (
            <button
              key={kind.key}
              type="button"
              onClick={() => {
                setAdding(false);
                router.push(`/team/contrib/add?kind=${kind.key}`);
              }}
              className="box-border flex min-h-[52px] w-full cursor-pointer items-center gap-[11px] rounded-control border border-line bg-card px-3.5 py-3 text-left"
            >
              <span className="flex-none text-txt-muted">
                <Icon name={kind.icon as IconName} size={18} />
              </span>
              <span className="min-w-0 flex-1 font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                {kind.name}
              </span>
              <span className="flex-none text-txt-muted">
                <Icon name="chevron-right" size={16} />
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
