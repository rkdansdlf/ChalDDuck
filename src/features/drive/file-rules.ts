import type { FileKind } from "@/lib/types";

/**
 * 드라이브에 올릴 수 있는 파일의 규칙.
 *
 * 서버(서명 주소 발급·저장 확인)와 화면(파일 고르기 창의 `accept`)이 **같은 표**를 본다.
 * 둘이 따로 적혀 있으면 고르기 창에서는 보이는데 서버가 거절하는 파일이 생긴다.
 * 저장소 키가 들어 있지 않아 브라우저에서 읽어도 된다.
 */

/** 한 파일의 크기 상한. 팀플 발표 자료 기준이고, 넘으면 올리기 전에 막는다. */
export const MAX_BYTES = 50 * 1024 * 1024;

/**
 * 팀 한 곳의 저장 용량. 핸드오프 정책표의 "드라이브 이용 제한"(2GB) 값이다 — 충분한지는
 * 아직 확정되지 않았다. 넘으면 올리기 전에 막는다.
 */
export const TEAM_CAP_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * 받을 형식.
 *
 * 화면이 안내하는 것과 같다(문서·이미지·PPT·PDF). 실행 파일이 팀 드라이브를 타고
 * 도는 일을 막으려는 것이기도 하다.
 */
export const ALLOWED_MIME: Record<string, FileKind> = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
};

/** 확장자 → 형식. 브라우저가 형식을 알려 주지 않을 때만 쓴다. */
const BY_EXTENSION: Record<string, { kind: FileKind; mime: string }> = {
  pptx: { kind: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  ppt: { kind: "pptx", mime: "application/vnd.ms-powerpoint" },
  docx: { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  doc: { kind: "docx", mime: "application/msword" },
  pdf: { kind: "pdf", mime: "application/pdf" },
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  gif: { kind: "image", mime: "image/gif" },
  webp: { kind: "image", mime: "image/webp" },
};

/**
 * "형식을 모른다"는 뜻의 MIME.
 *
 * 오피스가 깔리지 않은 PC 는 `.pptx` 를 빈 문자열이나 zip 으로 알려 준다(pptx 는 실제로
 * zip 이다). 이때만 확장자를 믿는다 — 브라우저가 분명히 다른 형식이라고 한 파일의
 * 이름만 바꿔 들여보내지 않기 위해서다.
 */
const UNKNOWN_MIME = new Set(["", "application/octet-stream", "application/zip", "application/x-zip-compressed"]);

/** 파일 고르기 창에 줄 `accept`. */
export const ACCEPT = [
  ...Object.keys(BY_EXTENSION).map((ext) => `.${ext}`),
  ...Object.keys(ALLOWED_MIME),
].join(",");

/**
 * 이 파일을 받을 수 있는지, 받는다면 어떤 형식으로 저장할지.
 *
 * @returns 받을 수 없으면 `null`. `contentType` 은 저장소에 적을 형식이다.
 */
export function resolveFileType(name: string, mime: string): { kind: FileKind; contentType: string } | null {
  const known = ALLOWED_MIME[mime];
  if (known) return { kind: known, contentType: mime };
  if (!UNKNOWN_MIME.has(mime)) return null;

  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const byExt = BY_EXTENSION[ext];
  return byExt ? { kind: byExt.kind, contentType: byExt.mime } : null;
}

/**
 * 앱 안에서 바로 그릴 수 있는 형식.
 *
 * 이미지는 그대로, PDF 는 브라우저 내장 뷰어로 연다(2026-09-25 결정 — 핸드오프 정책표의
 * "파일 뷰어 범위" 항목). PPT·DOCX 는 브라우저가 못 그려 내려받기 안내만 한다.
 */
export function canOpenInApp(kind: FileKind): boolean {
  return kind === "image" || kind === "pdf";
}

/**
 * 이 버전이 마감을 지나 올라왔는지.
 *
 * 저장해 두지 않고 그때그때 계산한다 — 마감을 옮기면 라벨도 따라와야 한다. 복원으로 생긴
 * 버전은 마감과 무관한 작업이라 세지 않는다.
 */
export function isLateVersion(
  version: { createdAt: Date; restoredFromId: string | null },
  dueAt: Date | null,
): boolean {
  return dueAt !== null && version.restoredFromId === null && version.createdAt > dueAt;
}

/** 사람이 읽을 크기. 표시용이고 계산에는 바이트 수를 쓴다. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
