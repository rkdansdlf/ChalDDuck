"use client";

import { useRef, useState, type DragEvent } from "react";
import { Btn, Field, Icon, Input, ProgressBar, Rows, Sheet, StatusBadge, Toast, type StatusKey } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ACCEPT, humanSize } from "./file-rules";
import { useUploads, type UploadDone, type UploadItem, type UploadStage } from "./use-uploads";

/**
 * 파일 올리기.
 *
 * 보이는 것은 버튼 하나지만 실제로는 숨은 `<input type="file">` 을 연다 — 기본 파일
 * 입력은 브라우저마다 생김새가 달라 앱의 버튼 규격에 맞지 않는다. 넓은 화면에서는
 * `dropzone` 을 주면 끌어다 놓을 자리가 함께 생긴다(휴대폰에는 끌어다 놓기가 없다).
 *
 * **같은 이름으로 올리면 새 파일이 아니라 그 파일의 새 버전이 된다.** 서버가 그렇게
 * 정하고, 결과 문구로 어느 쪽이었는지 알려 준다 — 덮어쓴 것처럼 보이면 안 되기 때문이다.
 *
 * 올리는 동안에는 파일마다 진행률이, 실패하면 이유와 "다시 시도"가 남는다. 조용히
 * 원래 버튼으로 돌아가는 일이 없어야 한다 — 그게 "올라간 건지 모르겠다"의 원인이었다.
 */
export function UploadButton({
  boxId,
  fileId,
  label,
  dropzone,
  askNote,
  onFinished,
  className,
}: {
  boxId: string;
  /** 버전 기록 화면 — 올리는 파일이 이름과 상관없이 이 파일의 새 버전이 된다. 한 번에 하나만. */
  fileId?: string;
  label: string;
  dropzone?: boolean;
  /**
   * 고른 뒤 올리기 전에 "무엇을 바꿨나요"를 묻는다(비워도 된다). 버전 기록 화면에서 쓴다 —
   * 이 메모가 기여도 리포트의 근거가 되는데, 자동 문구("새 버전")로는 아무것도 말해 주지 않는다.
   */
  askNote?: boolean;
  /**
   * 대기열이 끝났을 때. 주면 알림을 부르는 쪽이 띄운다(시트를 닫고 이동하는 경우 등).
   * 안 주면 이 버튼이 직접 알림을 띄운다.
   */
  onFinished?: (done: UploadDone[], failedCount: number) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // 메모를 묻는 동안 기다리는 파일.
  const [pending, setPending] = useState<File[] | null>(null);
  const [note, setNote] = useState("");

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const { items, busy, add, retry, dismiss } = useUploads({
    boxId,
    fileId,
    onFinished: (done, failedCount) => {
      if (onFinished) return onFinished(done, failedCount);
      const msg = uploadSummary(done);
      if (msg) flash(msg);
    },
  });

  const pick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    // 버전 기록 화면에서 여러 개를 놓으면 모두 같은 파일의 버전이 돼 버린다 — 첫 것만 받는다.
    const picked = fileId ? [list[0]] : Array.from(list);
    if (!askNote) return add(picked);
    setNote("");
    setPending(picked);
  };

  const confirm = () => {
    if (pending) add(pending, note);
    setPending(null);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files);
  };

  const button = (
    <Btn v="outline" size="sm" icon="paperclip" disabled={busy} onClick={() => input.current?.click()}>
      {busy ? "올리는 중" : label}
    </Btn>
  );

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        multiple={!fileId}
        accept={ACCEPT}
        onChange={(event) => {
          pick(event.target.files);
          // 같은 파일을 다시 고를 수 있게 비운다 — 안 비우면 두 번째 선택이 무시된다.
          event.target.value = "";
        }}
      />

      {dropzone ? (
        <>
          <div className="lg:hidden">{button}</div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "hidden flex-col items-center gap-2.5 rounded-[18px] border-2 border-dashed px-5 py-6 text-center lg:flex",
              dragging ? "border-yellow-500 bg-yellow-50" : "border-line-strong bg-transparent",
            )}
          >
            <span className="text-txt-muted">
              <Icon name="upload" size={22} />
            </span>
            <span className="t-note keep-all text-txt-muted">
              {fileId ? "파일을 여기로 끌어다 놓거나" : "파일을 여기로 끌어다 놓거나(여러 개 가능)"}
            </span>
            {button}
          </div>
        </>
      ) : (
        button
      )}

      {items.length > 0 ? (
        // 가로로 늘어선 줄(드라이브의 제출함 고르기 시트) 안에 놓여도 한 줄을 다 쓴다.
        <Rows className={cn("mt-3 basis-full", className)}>
          {items.map((item) => (
            <UploadRow key={item.id} item={item} onRetry={() => retry(item.id)} onDismiss={() => dismiss(item.id)} />
          ))}
        </Rows>
      ) : null}

      <Sheet open={pending !== null} title="무엇을 바꿨나요" onClose={() => setPending(null)}>
        <p className="t-note keep-all m-0 mb-3 text-txt-muted">
          {pending?.map((f) => f.name).join(", ")} · 버전 기록과 기여도 리포트에 이 메모가 남습니다.
        </p>
        <Field label="바꾼 내용" hint="비워 두면 “새 버전”으로만 남습니다.">
          {(props) => (
            <Input {...props} value={note} onChange={setNote} maxLength={200} placeholder="예: 3장 그래프 수정" autoFocus />
          )}
        </Field>
        <div className="flex gap-2">
          <Btn full v="outline" onClick={() => setPending(null)}>
            취소
          </Btn>
          <Btn full icon="upload" onClick={confirm}>
            올리기
          </Btn>
        </div>
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

/** 끝난 대기열을 한 문장으로. 부르는 쪽이 알림을 직접 띄울 때도 쓴다. */
export function uploadSummary(done: UploadDone[]): string | null {
  if (done.length === 0) return null;
  if (done.length > 1) return `파일 ${done.length}개를 올렸습니다`;
  const [one] = done;
  return one.isNewFile ? `${one.fileName} 을 올렸습니다` : `${one.fileName} 의 새 버전 ${one.label} 으로 쌓였습니다`;
}

/** 단계마다 상태 어휘. 새 상태를 지어내지 않고 `STATUS` 를 쓴다. */
const STAGE: Record<UploadStage, { status: StatusKey; text: string }> = {
  waiting: { status: "waiting", text: "대기" },
  uploading: { status: "doing", text: "올리는 중" },
  saving: { status: "doing", text: "기록하는 중" },
  done: { status: "done", text: "올림" },
  failed: { status: "failed", text: "실패" },
};

function UploadRow({ item, onRetry, onDismiss }: { item: UploadItem; onRetry: () => void; onDismiss: () => void }) {
  const stage = STAGE[item.stage];
  const pct = Math.round(item.progress * 100);

  return (
    <div className="px-[15px] py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-[14px] leading-[1.4] text-txt-strong">
          {item.name}
        </span>
        <StatusBadge status={stage.status}>{stage.text}</StatusBadge>
      </div>

      {item.stage === "uploading" ? (
        <div className="mt-2 flex items-center gap-2.5">
          <ProgressBar value={item.progress} label={`${item.name} 올리는 중`} className="flex-1" />
          <span className="t-note flex-none tabular-nums text-txt-muted">
            {pct}% · {humanSize(item.bytes)}
          </span>
        </div>
      ) : null}

      {item.stage === "failed" ? (
        <>
          <p className="t-note keep-all m-0 mt-1.5 text-txt-muted">{item.error}</p>
          <div className="mt-2 flex gap-2">
            {item.retryable ? (
              <Btn v="outline" size="sm" icon="rotate-ccw" onClick={onRetry}>
                다시 시도
              </Btn>
            ) : null}
            <Btn v="ghost" size="sm" icon="x" onClick={onDismiss}>
              목록에서 지우기
            </Btn>
          </div>
        </>
      ) : null}
    </div>
  );
}
