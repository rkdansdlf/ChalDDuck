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
  Undecided,
  type IconName,
} from "@/components/ui";
import type { ContribKind, ContribRecord } from "@/lib/types";
import { ContribRow } from "./contrib-row";
import { useMyContrib } from "./records-state";
import { StepRail } from "./step-rail";

/**
 * 16 기여도 · 본인 확인.
 *
 * 제품의 약속: **점수나 순위를 만들지 않는다.** 합의한 역할과 실제 수행 내역만 모으고,
 * MBTI·채팅량·친목은 기여도에 넣지 않는다.
 */
export function ContribSelfScreen({
  records: fromServer,
  kinds,
}: {
  records: ContribRecord[];
  kinds: ContribKind[];
}) {
  const router = useRouter();
  const records = useMyContrib(fromServer);
  const [adding, setAdding] = useState(false);

  const pending = records.filter((r) => r.state === "pending").length;

  return (
    <>
      <AppBar
        title="내 기여 기록"
        sub="2 / 4단계 · 본인 확인"
        onBack={() => router.push("/team")}
      />

      <Body dense>
        <StepRail at={1} />

        <Note tone="info" icon="scale" title="점수나 순위를 만들지 않습니다" className="mb-3.5">
          합의한 역할과 <b>실제 수행 내역</b>만 모읍니다. MBTI, 채팅량, 친목은 기여도에 넣지 않습니다.
        </Note>

        <SecTitle note="빠진 항목이 있으면 직접 추가할 수 있습니다">
          앱이 모은 기록 {records.length}건
        </SecTitle>
        <Rows className="mb-3">
          {records.map((record) => (
            <ContribRow key={record.id} record={record} kinds={kinds} />
          ))}
        </Rows>

        <Btn v="outline" full icon="plus" className="mb-3.5" onClick={() => setAdding(true)}>
          공동·오프라인 작업 추가
        </Btn>

        {pending > 0 ? (
          <Note tone="warn" icon="circle-dashed" title={`확인 대기 ${pending}건`}>
            내가 추가한 항목은 팀원이 확인하기 전까지 <b>대기</b>로 남습니다. 임의로 확정하지 않습니다.
          </Note>
        ) : null}

        <Undecided>
          회의 참여를 무엇으로 판정하는지(입장 여부·발언 여부·시간)가 기획안에 없습니다. 지금은 회수만
          적고 기준을 적지 않았습니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          iconRight="arrow-right"
          onClick={() => router.push("/team/contrib/members")}
        >
          팀원 확인으로 넘기기
        </Btn>
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
