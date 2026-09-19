"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Field,
  Icon,
  Input,
  Note,
  Undecided,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ContribKind } from "@/lib/types";
import { addContribRecord } from "./records-state";

/**
 * 23 기여 기록 추가 — 앱이 놓친 일을 본인이 넣는 화면.
 *
 * 앱은 드라이브·회의처럼 앱 안에서 일어난 일만 볼 수 있다. 오프라인 작업이나 공동 작업은
 * 본인이 넣어야 기록에 남는다. 다만 **넣는 즉시 확정되지는 않는다** — 팀원 확인을 거친다.
 */
export function ContribAddScreen({ kind }: { kind: ContribKind }) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [hasEvidence, setHasEvidence] = useState(false);

  const submit = () => {
    if (!title.trim()) return;
    addContribRecord({ kind: kind.key, title: title.trim(), hasEvidence });
    router.push("/team/contrib");
  };

  return (
    <>
      <AppBar title="빠진 기록 추가" onBack={() => router.push("/team/contrib")} />

      <Body dense>
        <Note tone="info" icon="user-round" title={`${kind.name} · 직접 추가`} className="mb-4">
          앱 밖에서 한 일도 기록에 넣을 수 있습니다. 추가한 항목은 팀원 확인을 거쳐야 확정됩니다.
        </Note>

        <Field label="무슨 일을 했나요" required>
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={setTitle}
              placeholder="예: 발표 자료 오탈자 전체 검토"
              autoFocus
            />
          )}
        </Field>

        <Field label="근거" hint="스크린샷·링크가 있으면 팀원이 확인하기 쉬워집니다.">
          {(props) => (
            <button
              {...props}
              type="button"
              aria-pressed={hasEvidence}
              // TODO(서버): 실제 파일 첨부는 드라이브 업로드와 같은 경로를 쓴다.
              onClick={() => setHasEvidence((v) => !v)}
              className={cn(
                "box-border flex min-h-[50px] w-full cursor-pointer items-center justify-center gap-2 rounded-control border-[1.5px] border-dashed font-semibold text-[14px] leading-none",
                hasEvidence
                  ? "border-yellow-500 bg-yellow-100 text-yellow-700"
                  : "border-line-strong bg-card text-txt-muted",
              )}
            >
              <Icon name={hasEvidence ? "check" : "paperclip"} size={16} />
              {hasEvidence ? "근거 파일 1개 첨부됨" : "스크린샷·링크 등 근거 첨부(선택)"}
            </button>
          )}
        </Field>

        <Btn full size="lg" onClick={submit} disabled={!title.trim()}>
          추가하고 확인 요청하기
        </Btn>

        <Undecided>근거 파일의 형식·용량 제한이 기획안에 없어 다루지 않았습니다.</Undecided>
      </Body>
    </>
  );
}
