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
  StatusBadge,
  Undecided,
} from "@/components/ui";
import type { ContribKind } from "@/lib/types";
import { addContribRecord } from "@/server/actions/contrib";

/**
 * 23 기여 기록 추가 — 앱이 놓친 일을 본인이 넣는 화면.
 *
 * 앱은 드라이브·회의처럼 앱 안에서 일어난 일만 볼 수 있다. 오프라인 작업이나 공동 작업은
 * 본인이 넣어야 기록에 남는다. 다만 **넣는 즉시 확정되지는 않는다** — 팀원 확인을 거친다.
 */
export function ContribAddScreen({ kind }: { kind: ContribKind }) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await addContribRecord({ kind: kind.key, title: title.trim() });
      router.push("/team/contrib");
      router.refresh();
    } finally {
      setSaving(false);
    }
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

        {/* 근거 첨부는 아직 파일을 받지 않는다. 예전에는 누르면 "첨부됨"으로 바뀌고 기록에도
            "근거 첨부됨"이 남았는데, 실제 파일은 없어서 확인하는 팀원이 볼 것이 없었다.
            기여 기록은 성적 근거라, 없는 근거를 있다고 적는 쪽이 더 나쁘다.
            TODO(서버): 실제 파일 첨부는 드라이브 업로드와 같은 경로를 쓴다. */}
        <Field label="근거" hint="지금은 무슨 일을 했는지만 적어 주세요. 팀원이 확인합니다.">
          {(props) => (
            <div
              id={props.id}
              className="box-border flex min-h-[50px] w-full items-center justify-center gap-2 rounded-control border-[1.5px] border-dashed border-line-strong bg-card font-semibold text-[14px] leading-none text-txt-muted"
            >
              <Icon name="paperclip" size={16} />
              근거 파일 첨부
              <StatusBadge status="ready" />
            </div>
          )}
        </Field>

        <Btn full size="lg" onClick={submit} disabled={!title.trim() || saving}>
          {saving ? "추가하는 중" : "추가하고 확인 요청하기"}
        </Btn>

        <Undecided>근거 파일의 형식·용량 제한이 기획안에 없어 다루지 않았습니다.</Undecided>
      </Body>
    </>
  );
}
