"use client";

import { useRouter } from "next/navigation";
import { Btn, Note, Panel, SecTitle, Sheet, Toast } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import type { TeamCheckRecord } from "@/lib/types";
import { resolveContribDispute } from "@/server/actions/contrib";

export function ContribResolveSheet({
  open,
  record,
  onClose,
  onResolved,
}: {
  open: boolean;
  record: TeamCheckRecord | null;
  onClose: () => void;
  onResolved?: () => void;
}) {
  const router = useRouter();
  const { toast, busy, flash, run } = useAction();
  const answering = busy.resolve === true;

  if (!record) return null;

  const resolve = (way: string) =>
    run(
      "resolve",
      async () => {
        const answer = await resolveContribDispute(record.id, way);
        if (answer === "gone") {
          flash("이 기록은 이미 정리됐습니다. 앞선 답변을 확인해 주세요.");
          return;
        }
        if (answer === "notYours") {
          flash("이 기록은 기록을 적은 사람과 의견을 적은 사람만 답할 수 있습니다.");
          return;
        }
        if (answer === "ok") {
          onResolved?.();
          onClose();
          router.refresh();
          return "의견 차이가 정리되었습니다.";
        }
      },
      "답하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

  return (
    <>
      <Sheet
        open={open}
        title="의견 조율 및 정정 응답"
        onClose={onClose}
        footer={
          <Btn full size="lg" v="outline" onClick={onClose} disabled={answering}>
            닫기
          </Btn>
        }
      >
        <div className="space-y-3.5">
          <div>
            <SecTitle>원래 기록</SecTitle>
            <Panel s="fill" pad={13} r={14}>
              <div className="keep-all font-bold text-[14px] leading-snug text-txt-strong">
                {record.title}
              </div>
              <div className="mt-1 font-medium text-[12.5px] text-txt-muted">{record.who}</div>
            </Panel>
          </div>

          <div>
            <SecTitle>적힌 의견</SecTitle>
            <Panel s="coral" pad={13} r={14}>
              <div className="text-pretty-keep text-[13.5px] leading-relaxed text-[#8A3B29]">
                {record.dispute}
              </div>
            </Panel>
          </div>

          <Note tone="info" icon="pen-line">
            의견이 다른 항목은 한쪽 말로 덮지 않고 둘 다 보존됩니다.
            서로 합의하여 정리하거나, 공동 작업으로 나눌 수 있습니다.
          </Note>

          {record.dmWith ? (
            <div>
              <Btn
                full
                size="sm"
                v="outline"
                icon="messages-square"
                onClick={() => {
                  onClose();
                  router.push(`/chat/dm/${record.dmWith}`);
                }}
              >
                1:1 DM으로 먼저 대화하기
              </Btn>
            </div>
          ) : null}

          {record.iCanResolve ? (
            <div className="flex flex-col gap-2 pt-1">
              <Btn
                full
                size="md"
                v="yellow"
                icon="check"
                disabled={answering}
                onClick={() => resolve("accept")}
              >
                정정 의견에 동의하기
              </Btn>
              <Btn
                full
                size="md"
                v="outline"
                icon="split"
                disabled={answering}
                onClick={() => resolve("split")}
              >
                공동 작업으로 나누기
              </Btn>
              <Btn
                full
                size="md"
                v="ghost"
                icon="circle-help"
                disabled={answering}
                onClick={() => resolve("noAgreement")}
              >
                합의 없음 · 원문 그대로 두기
              </Btn>
            </div>
          ) : (
            <Note tone="warn" icon="info">
              이 기록을 정리할 수 있는 사람은 <b>기록을 적은 사람</b>과 <b>의견을 적은 사람</b>뿐입니다.
            </Note>
          )}
        </div>
      </Sheet>
      <Toast msg={toast} />
    </>
  );
}
