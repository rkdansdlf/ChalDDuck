"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppBar, Body, Btn, Field, Icon, IconButton, Input, Note, Undecided } from "@/components/ui";
import { ACCEPT, humanSize } from "@/features/drive/file-rules";
import { putToStorage, REJECTION_TEXT } from "@/features/drive/use-uploads";
import type { ContribKind } from "@/lib/types";
import { addContribRecord, prepareEvidenceUpload } from "@/server/actions/contrib";

/**
 * 23 기여 기록 추가 — 앱이 놓친 일을 본인이 넣는 화면.
 *
 * 앱은 드라이브·회의처럼 앱 안에서 일어난 일만 볼 수 있다. 오프라인 작업이나 공동 작업은
 * 본인이 넣어야 기록에 남는다. 다만 **넣는 즉시 확정되지는 않는다** — 팀원 확인을 거친다.
 */
export function ContribAddScreen({ kind }: { kind: ContribKind }) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  /**
   * 근거가 있으면 먼저 저장소에 올리고, 그 경로로 기록을 만든다. 서버는 기록을 만들기 전에
   * 올라온 객체를 다시 확인한다 — 규칙에 어긋나면 기록도 만들지 않는다.
   */
  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      let evidence: { path: string; name: string } | undefined;
      if (file) {
        const ticket = await prepareEvidenceUpload({ name: file.name, size: file.size, type: file.type });
        if (ticket.status !== "ok") return setError(REJECTION_TEXT[ticket.status]);
        setProgress(0);
        await putToStorage(ticket.signedUrl, file, ticket.contentType, setProgress);
        evidence = { path: ticket.path, name: file.name };
      }

      const result = await addContribRecord({ kind: kind.key, title: title.trim(), evidence });
      if (result.status !== "ok") return setError(REJECTION_TEXT[result.status]);
      router.push("/team/contrib");
      router.refresh();
    } catch {
      // 서버에서 던진 문구는 운영 빌드에서 지워지므로(그리고 개발 중에는 Prisma 원문이 나오므로)
      // 사람이 읽을 문장을 여기서 정한다. 저장소 쪽 실패는 `putToStorage` 가 이미 문장으로 준다.
      setError("추가하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
      setProgress(null);
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

        {/* 근거는 드라이브와 같은 규칙(문서·이미지·PPT·PDF, 50MB)으로 저장소에 올린다.
            확인하는 팀원이 기록 옆의 "근거 보기"로 연다. */}
        <Field label="근거" hint="작업한 파일이나 캡처가 있으면 팀원이 확인하기 쉽습니다.">
          {(props) =>
            file ? (
              <div
                id={props.id}
                className="box-border flex min-h-[50px] w-full items-center gap-2.5 rounded-control border border-line bg-card px-3.5"
              >
                <Icon name="paperclip" size={16} className="flex-none text-txt-muted" />
                <span className="min-w-0 flex-1">
                  <span className="t-label block truncate text-txt-strong">{file.name}</span>
                  <span className="t-cap block text-txt-muted">
                    {progress === null ? humanSize(file.size) : `올리는 중 ${Math.round(progress * 100)}%`}
                  </span>
                </span>
                <IconButton icon="x" label="근거 빼기" onClick={() => !saving && setFile(null)} />
              </div>
            ) : (
              <button
                id={props.id}
                type="button"
                onClick={() => picker.current?.click()}
                className="box-border flex min-h-[50px] w-full cursor-pointer items-center justify-center gap-2 rounded-control border-[1.5px] border-dashed border-line-strong bg-card font-semibold text-[14px] leading-none text-txt-strong"
              >
                <Icon name="paperclip" size={16} />
                근거 파일 첨부
              </button>
            )
          }
        </Field>
        <input
          ref={picker}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
            event.target.value = "";
          }}
        />

        {error ? (
          <Note tone="err" icon="circle-alert" className="mb-3">
            {error}
          </Note>
        ) : null}

        <Btn full size="lg" onClick={submit} disabled={!title.trim() || saving}>
          {saving ? "추가하는 중" : "추가하고 확인 요청하기"}
        </Btn>

        <Undecided>
          근거 파일의 형식·용량 제한이 기획안에 없어 드라이브와 같은 규칙(문서·이미지·PPT·PDF, 50MB)을
          따릅니다. 팀 드라이브 용량(2GB)에 근거 파일을 포함할지도 정해지지 않았습니다.
        </Undecided>
      </Body>
    </>
  );
}
