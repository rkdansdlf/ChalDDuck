"use client";

import { useRouter } from "next/navigation";
import { AppBar, Body, Btn, Note, Panel, SecTitle, Toast, Undecided } from "@/components/ui";
import { useAction } from "@/lib/use-action";
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
  const { toast, busy, run } = useAction();
  const answering = busy.resolve === true;

  /**
   * 정정에 답한다.
   *
   * **결과를 보아야 한다.** 예전에는 `resolveContribDispute` 가 돌려주는
   * `"ok" | "gone"` 을 버리고 곧바로 이동했다. `"gone"` 은 "남이 먼저 정리했다" 는 뜻인데,
   * 그래도 사용자는 자기 답변이 반영됐다고 믿었다. 그리고 `catch` 가 없어 서버가
   * 거부하면(세션 만료·이미 정리) 아무 말 없이 같은 화면에 남았다.
   */
  const resolve = (way: string) =>
    run(
      "resolve",
      async () => {
        const answer = await resolveContribDispute(record.id, way);
        if (answer === "gone") {
          // 이미 정리된 기록이다 — 앞선 답변이 남아 있으므로 그걸 보여 주는 곳으로 보낸다.
          return "이 기록은 이미 정리됐습니다. 앞선 답변을 확인해 주세요";
        }
        router.push("/team/contrib/members");
        router.refresh();
      },
      "답하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

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
            onClick={() => void resolve("정정 동의 · 의견대로 수정")}
          >
            정정 의견에 동의하기
          </Btn>
          <Btn
            full
            v="outline"
            icon="split"
            disabled={answering}
            onClick={() => void resolve("공동 작업으로 나눔")}
          >
            공동 작업으로 나누기
          </Btn>
        </div>

        <Undecided>정정에도 합의가 안 되면 어떻게 되는지는 기획안에 없어 다루지 않았습니다.</Undecided>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
