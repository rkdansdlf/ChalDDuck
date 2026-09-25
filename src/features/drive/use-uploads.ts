"use client";

import { useEffect, useRef, useState } from "react";
import { finishUpload, prepareUpload, type UploadRejection } from "@/server/actions/drive";

/**
 * 파일 올리기 대기열.
 *
 * 한 번에 여러 개를 골라도 **하나씩 차례로** 올린다 — 같은 이름 두 개가 동시에 들어가면
 * 버전 이름(v3)이 겹칠 수 있고, 휴대폰 회선에서 동시에 올리면 전부 느려진다.
 *
 * 한 파일은 세 단계를 거친다.
 * 1. 서버가 올릴 주소를 발급한다(`prepareUpload`) — 권한·크기·형식 확인
 * 2. 브라우저가 저장소에 **직접** 올린다 — 이때만 진행률이 있다
 * 3. 서버가 저장소에 들어온 것을 확인하고 버전 기록에 남긴다(`finishUpload`)
 */

export type UploadStage = "waiting" | "uploading" | "saving" | "done" | "failed";

export type UploadItem = {
  id: string;
  name: string;
  bytes: number;
  stage: UploadStage;
  /** 저장소로 보낸 비율(0~1). `uploading` 일 때만 의미가 있다. */
  progress: number;
  /** 실패했을 때 사람에게 보일 이유. */
  error: string | null;
  /** 다시 해 볼 만한 실패인지. 형식·크기 때문이면 다시 해도 똑같다. */
  retryable: boolean;
};

export type UploadDone = { fileId: string; fileName: string; label: string; isNewFile: boolean };

export const REJECTION_TEXT: Record<UploadRejection | "missing", string> = {
  "too-big": "50MB 가 넘는 파일은 올릴 수 없습니다.",
  "bad-type": "문서·이미지·PPT·PDF 만 올릴 수 있습니다.",
  empty: "빈 파일은 올릴 수 없습니다.",
  "not-configured": "파일 저장소가 아직 연결되지 않았습니다(SUPABASE_SECRET_KEY).",
  "kind-mismatch": "이 파일과 같은 형식만 새 버전으로 올릴 수 있습니다.",
  missing: "저장소에 파일이 들어오지 않았습니다. 다시 시도해 주세요.",
};

/** 다시 해도 결과가 같은 거절. */
const FINAL: ReadonlySet<string> = new Set(["too-big", "bad-type", "empty", "kind-mismatch", "not-configured"]);

class UploadFailure extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * 서명된 주소로 저장소에 직접 올린다.
 *
 * `fetch` 는 올리는 쪽 진행률을 알려 주지 않아 `XMLHttpRequest` 를 쓴다. 본문은 파일 그대로
 * 보내고 형식은 헤더로 준다 — 저장소는 이 헤더를 객체의 형식으로 적고, 서버는 3단계에서
 * 그 값을 다시 확인한다.
 */
export function putToStorage(url: string, file: File, contentType: string, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // 버킷의 크기 상한에 걸리면 413 이다. 그 밖의 거절은 대개 일시적이다.
      reject(
        xhr.status === 413
          ? new UploadFailure(REJECTION_TEXT["too-big"], false)
          : new UploadFailure("저장소가 파일을 받지 않았습니다. 잠시 후 다시 시도해 주세요.", true),
      );
    };
    xhr.onerror = () => reject(new UploadFailure("연결이 끊겨 올리지 못했습니다.", true));
    xhr.send(file);
  });
}

export function useUploads({
  boxId,
  fileId,
  onFinished,
}: {
  boxId: string;
  /** 버전 기록 화면에서 — 올리는 파일은 모두 이 파일의 새 버전이 된다. */
  fileId?: string;
  /** 대기열이 비었을 때. 이번에 성공한 것과, 실패가 남았는지를 준다. */
  onFinished?: (done: UploadDone[], failedCount: number) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const files = useRef(new Map<string, File>());
  const queue = useRef<string[]>([]);
  const running = useRef(false);
  // 대기열 한 바퀴 동안 성공한 것. 끝날 때 한꺼번에 알린다.
  const batch = useRef<UploadDone[]>([]);
  const failed = useRef(0);
  // 줄 id. `crypto.randomUUID` 는 https 에서만 있어 같은 와이파이의 휴대폰(http)으로 열면 없다.
  const seq = useRef(0);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  });

  const patch = (id: string, change: Partial<UploadItem>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const uploadOne = async (id: string) => {
    const file = files.current.get(id);
    if (!file) return;
    patch(id, { stage: "uploading", progress: 0, error: null });

    try {
      const prep = await prepareUpload(boxId, { name: file.name, size: file.size, type: file.type }, fileId).catch(
        () => {
          throw new UploadFailure("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
        },
      );
      if (prep.status !== "ok") throw new UploadFailure(REJECTION_TEXT[prep.status], !FINAL.has(prep.status));

      await putToStorage(prep.signedUrl, file, prep.contentType, (ratio) => patch(id, { progress: ratio }));
      patch(id, { stage: "saving", progress: 1 });

      const result = await finishUpload(boxId, { path: prep.path, name: file.name }, fileId).catch(() => {
        throw new UploadFailure("올렸지만 기록하지 못했습니다. 다시 시도해 주세요.", true);
      });
      if (result.status !== "ok") throw new UploadFailure(REJECTION_TEXT[result.status], !FINAL.has(result.status));

      patch(id, { stage: "done" });
      files.current.delete(id);
      batch.current.push(result);
    } catch (err) {
      const failure =
        err instanceof UploadFailure ? err : new UploadFailure("알 수 없는 이유로 올리지 못했습니다.", true);
      failed.current += 1;
      patch(id, { stage: "failed", error: failure.message, retryable: failure.retryable });
    }
  };

  const pump = async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let next = queue.current.shift(); next; next = queue.current.shift()) {
        await uploadOne(next);
      }
    } finally {
      running.current = false;
    }

    const done = batch.current;
    const failedCount = failed.current;
    batch.current = [];
    failed.current = 0;
    // 다 끝난 줄은 치운다 — 결과는 목록 자체(방금 올린 파일 강조)와 알림으로 보인다.
    // 실패한 줄만 남겨 다시 시도할 수 있게 한다.
    setItems((list) => list.filter((item) => item.stage !== "done"));
    finished.current?.(done, failedCount);
  };

  const add = (picked: Iterable<File>) => {
    const fresh: UploadItem[] = [];
    for (const file of picked) {
      const id = `upload-${(seq.current += 1)}`;
      files.current.set(id, file);
      queue.current.push(id);
      fresh.push({
        id,
        name: file.name,
        bytes: file.size,
        stage: "waiting",
        progress: 0,
        error: null,
        retryable: true,
      });
    }
    if (fresh.length === 0) return;
    setItems((list) => [...list, ...fresh]);
    void pump();
  };

  const retry = (id: string) => {
    if (!files.current.has(id)) return;
    patch(id, { stage: "waiting", progress: 0, error: null });
    queue.current.push(id);
    void pump();
  };

  const dismiss = (id: string) => {
    files.current.delete(id);
    setItems((list) => list.filter((item) => item.id !== id));
  };

  const busy = items.some((item) => item.stage === "waiting" || item.stage === "uploading" || item.stage === "saving");

  // 올리는 도중에 탭을 닫거나 새로고침하면 묻는다 — 조용히 끊기면 "올린 줄 알았다"가 된다.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  return { items, busy, add, retry, dismiss };
}
