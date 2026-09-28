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
 *
 * **여는 사람은 기록 주인과 지금 의견을 적은 사람뿐이다**(17 화면이 감추고 서버가 다시
 * 본다). 주소를 알면 들어올 수 있으므로 이 화면도 같은 조건을 지킨다 — 선택지를 두고
 * 눌렀다 "안 됩니다" 를 듣는 것보다, 왜 내가 답할 자리가 아닌지 바로 말하는 편이 낫다.
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
        if (answer === "notYours") {
          // 17 화면이 감춘 버튼을 주소로 직접 들어온 경우다. 조용히 실패시키지 않고 이유를 말한다.
          return "이 기록은 기록을 적은 사람과 의견을 적은 사람만 답할 수 있습니다";
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
          수 있습니다. <b>답이 없으면</b> 마지막 길로 원문 그대로 두고 닫을 수도 있습니다 — 그쪽 말은
          그대로 남고 리포트에 &ldquo;정리되지 않은 의견&rdquo;으로 세어집니다.
        </Note>

        {record.iCanResolve ? (
          <div className="flex flex-col gap-2">
            <Btn
              full
              icon="check"
              disabled={answering}
              onClick={() => void resolve("accept")}
            >
              정정 의견에 동의하기
            </Btn>
            <Btn
              full
              v="outline"
              icon="split"
              disabled={answering}
              onClick={() => void resolve("split")}
            >
              공동 작업으로 나누기
            </Btn>
            {/* 세 번째 길 — 이것이 없으면 답하지 않은 의견이 영영 닫히지 않는다.
                "합의 없음"은 실패가 아니라 **기록된 사실**이라 원문 그대로 두고 닫는다. */}
            <Btn
              full
              v="ghost"
              icon="circle-help"
              disabled={answering}
              onClick={() => void resolve("noAgreement")}
            >
              합의 없음 · 원문 그대로 두기
            </Btn>
          </div>
        ) : (
          <Note tone="warn" icon="info" className="mb-4">
            이 기록을 정리할 수 있는 사람은 <b>기록을 적은 사람</b>과 <b>의견을 적은 사람</b>뿐입니다.
            남은 팀원은 1:1 대화에서 이야기해 주세요 — 결론을 적는 자리는 두 사람의 몫입니다.
          </Note>
        )}

        {/* 결론을 고르는 자리인 만큼, 아직 정해지지 않은 기재 방식은 **여기** 적는 편이 맞다.
            문서에 적으면 화면을 고치며 말과 어긋나고(핸드오프 정책표가 그랬다), `npm run
            decisions` 가 이 상자를 읽는다. */}
        <Undecided>
          의견 차이가 끝까지 안 좁혀졌을 때의 최종 기재 방식은 기획안에 없습니다. 지금은 양쪽
          의견을 함께 남깁니다 — <b>답이 없으면 &quot;합의 없음 · 원문 유지&quot;</b> 로 닫고, 리포트에
          &quot;정리되지 않은 의견&quot;으로 셉니다.
        </Undecided>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
