"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Body, Btn, Note, Panel, SecTitle, Undecided } from "@/components/ui";
import type { TeamCheckRecord } from "@/lib/types";
import { resolveContribDispute } from "@/server/actions/contrib";

/**
 * 23 기여 기록 정정 응답 — 누군가 "사실과 다르다"고 적은 항목에 답하는 화면.
 *
 * 고를 수 있는 길이 두 개뿐인 것이 의도다: **상대 의견을 받아들이거나, 공동 작업으로 나누거나.**
 * "내 말이 맞다"로 덮는 선택지는 두지 않는다 — 그러면 정정이 무의미해진다.
 */
export function ContribResolveScreen({ record }: { record: TeamCheckRecord }) {
  const router = useRouter();
  const [answering, setAnswering] = useState(false);

  const resolve = async (way: string) => {
    if (answering) return;
    setAnswering(true);
    try {
      await resolveContribDispute(record.id, way);
      router.push("/team/contrib/members");
      router.refresh();
    } finally {
      setAnswering(false);
    }
  };

  return (
    <>
      <AppBar title="정정 응답" onBack={() => router.push("/team/contrib/members")} />

      <Body dense>
        <SecTitle>원래 기록</SecTitle>
        <Panel s="fill" pad={14} r={16} className="mb-3.5">
          <div className="keep-all font-bold text-[14.5px] leading-[1.4] text-txt-strong">
            {record.title}
          </div>
          <div className="mt-1 font-medium text-[13px] leading-[1.4] text-txt-muted">{record.who}</div>
        </Panel>

        <SecTitle>적힌 의견</SecTitle>
        <Panel s="coral" pad={14} r={16} className="mb-4">
          <div className="text-pretty-keep text-[14.5px] leading-[1.6] text-[#8A3B29]">
            {record.dispute}
          </div>
        </Panel>

        <Note tone="info" icon="pen-line" className="mb-4">
          의견이 다른 항목은 한쪽 말로 덮지 않습니다. 둘 중 하나로 정리하거나, 공동 작업으로 나눠 적을
          수 있습니다.
        </Note>

        <div className="flex flex-col gap-2">
          <Btn
            full
            icon="check"
            disabled={answering}
            onClick={() => resolve("정정 동의 · 의견대로 수정")}
          >
            정정 의견에 동의하기
          </Btn>
          <Btn
            full
            v="outline"
            icon="split"
            disabled={answering}
            onClick={() => resolve("공동 작업으로 나눔")}
          >
            공동 작업으로 나누기
          </Btn>
        </div>

        <Undecided>정정에도 합의가 안 되면 어떻게 되는지는 기획안에 없어 다루지 않았습니다.</Undecided>
      </Body>
    </>
  );
}
