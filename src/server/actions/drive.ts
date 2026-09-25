"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { nextVersionLabel } from "@/features/drive/version-label";
import type { FileKind } from "@/lib/types";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import { MAX_BYTES, canOpenInApp, humanSize, resolveFileType } from "@/features/drive/file-rules";
import { isStorageConfigured, storage } from "@/server/storage/client";

/**
 * 22 파일 복원 서버 액션.
 *
 * 핵심 규칙: **복원은 덮어쓰기가 아니라 새 버전 추가다.** 옛 버전으로 되돌려도 그 사이의
 * 작업이 사라지지 않아야 하고, 되돌린 것 자체도 누가 언제 했는지 기록에 남아야 한다
 * — 이 기록은 기여도 리포트의 근거로도 쓰인다.
 */

/**
 * `versionId` 의 내용을 새 버전으로 맨 위에 추가한다. 기존 버전은 하나도 지우지 않는다.
 *
 * @returns 새로 만들어진 버전 이름("v5"). 화면이 "v5로 추가했습니다"라고 알린다.
 */
export async function restoreFileVersion(fileId: string, versionId: string): Promise<string> {
  const me = await requireSessionMember();

  // 화면이 보낸 파일이 정말 우리 팀 것인지 서버에서 확인한다.
  const file = await db.submittedFile.findFirst({
    where: { id: fileId, box: { teamId: me.teamId } },
  });
  if (!file) throw new Error("파일을 찾을 수 없습니다.");

  const versions = await db.fileVersion.findMany({ where: { fileId: file.id } });
  const source = versions.find((v) => v.id === versionId);
  if (!source) throw new Error("복원할 버전을 찾을 수 없습니다.");

  const label = nextVersionLabel(versions);

  await db.fileVersion.create({
    data: {
      fileId: file.id,
      label,
      authorId: me.id,
      note: `${source.label} 복원`,
      size: source.size,
      kind: source.kind,
      previewUrl: source.previewUrl,
      // 같은 저장소 객체를 가리킨다 — 복사하지 않는다. 버전은 내용의 이름표다.
      storagePath: source.storagePath,
      bytes: source.bytes,
      mimeType: source.mimeType,
      // 복원은 마감과 무관한 작업이다 — 원본이 지각 제출이었어도 늦은 제출로 세지 않는다.
      isLate: false,
      whenLabel: "방금",
    },
  });

  revalidatePath("/drive", "layout");
  revalidatePath("/home");
  return label;
}

/** 올리기를 거절한 이유 — 화면이 무엇이 잘못됐는지 정확히 말할 수 있게 나눠 준다. */
export type UploadRejection =
  | "too-big"
  | "bad-type"
  | "empty"
  | "not-configured"
  /** 버전 기록 화면에서 다른 형식을 그 파일의 새 버전으로 올리려 했다. */
  | "kind-mismatch";

export type PrepareUploadResult =
  | { status: "ok"; path: string; signedUrl: string; contentType: string }
  | { status: UploadRejection };

/**
 * 올리기 1단계 — 브라우저가 저장소에 **직접** 올릴 수 있는 주소를 발급한다.
 *
 * 파일 본문은 이 앱 서버를 거치지 않는다. 서버 액션은 요청 본문이 1MB 로 막혀 있고
 * (Vercel 함수도 4.5MB), 발표 자료는 대개 그보다 크다. 예전에는 파일을 서버 액션으로
 * 보내서 1MB 가 넘으면 아무 안내 없이 실패했다.
 *
 * 여기서는 **누가 어느 칸에 무엇을 올리려는지**만 확인하고, 저장소 경로를 서버가 정한다.
 * 올라온 내용은 `finishUpload` 가 저장소에서 다시 확인한다 — 이 단계의 크기·형식은
 * 브라우저가 알려 준 값이라 믿을 수 없다.
 *
 * @param fileId 버전 기록 화면에서 올릴 때 — 이름이 달라도 **그 파일의** 새 버전이 된다.
 */
export async function prepareUpload(
  boxId: string,
  meta: { name: string; size: number; type: string },
  fileId?: string,
): Promise<PrepareUploadResult> {
  const me = await requireSessionMember();
  if (!isStorageConfigured()) return { status: "not-configured" };

  const box = await db.submissionBox.findFirst({ where: { id: boxId, teamId: me.teamId } });
  if (!box) throw new Error("제출함을 찾을 수 없습니다.");

  if (meta.size <= 0) return { status: "empty" };
  if (meta.size > MAX_BYTES) return { status: "too-big" };

  const type = resolveFileType(meta.name, meta.type);
  if (!type) return { status: "bad-type" };

  if (fileId) {
    const target = await db.submittedFile.findFirst({ where: { id: fileId, boxId: box.id } });
    if (!target) throw new Error("파일을 찾을 수 없습니다.");
    if (target.kind !== type.kind) return { status: "kind-mismatch" };
  }

  // 경로에 임의값을 넣는다 — 파일 이름으로 만들면 같은 이름의 다음 버전이 앞 버전을
  // 덮어쓰고, 이름을 아는 사람이 경로를 찍어 볼 수도 있다. 저장소 객체는 **버전마다
  // 하나**다(같은 경로에 덮어쓰면 옛 버전을 내려받을 때 새 내용이 나온다).
  const path = `${box.teamId}/${box.id}/${randomUUID()}`;

  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error) {
    console.error("[storage] 올리기 주소 발급 실패:", error);
    throw new Error("저장소가 응답하지 않습니다.");
  }
  return { status: "ok", path, signedUrl: data.signedUrl, contentType: type.contentType };
}

export type FinishUploadResult =
  | { status: "ok"; fileId: string; fileName: string; label: string; isNewFile: boolean }
  | { status: UploadRejection | "missing" };

/**
 * 올리기 2단계 — 저장소에 들어온 파일을 버전 기록에 남긴다.
 *
 * **같은 이름이면 새 파일이 아니라 그 파일의 새 버전이 된다.** 덮어쓰지 않는다 —
 * 이전 버전은 저장소에 그대로 남고 목록에도 남는다. 이것이 드라이브의 약속이다.
 *
 * 크기·형식은 브라우저가 1단계에서 말한 값이 아니라 **저장소에 실제로 들어온 객체**로
 * 다시 본다. 서명 주소로는 무엇이든 올릴 수 있기 때문이다. 규칙에 어긋나면 객체를 지우고
 * 기록을 남기지 않는다.
 */
export async function finishUpload(
  boxId: string,
  upload: { path: string; name: string },
  fileId?: string,
): Promise<FinishUploadResult> {
  const me = await requireSessionMember();
  if (!isStorageConfigured()) return { status: "not-configured" };

  const box = await db.submissionBox.findFirst({ where: { id: boxId, teamId: me.teamId } });
  if (!box) throw new Error("제출함을 찾을 수 없습니다.");

  // 1단계에서 서버가 정해 준 모양의 경로만 받는다 — 다른 팀·다른 칸의 객체를 제 것처럼
  // 기록에 붙이지 못하게.
  const prefix = `${box.teamId}/${box.id}/`;
  const rest = upload.path.startsWith(prefix) ? upload.path.slice(prefix.length) : "";
  if (!/^[0-9a-f-]{36}$/.test(rest)) throw new Error("올린 파일의 경로가 올바르지 않습니다.");

  const name = upload.name.trim().slice(0, 200);
  if (!name) return { status: "empty" };

  // 응답이 늦어 화면이 한 번 더 보냈을 때 같은 버전이 둘 생기지 않게.
  const already = await db.fileVersion.findFirst({
    where: { storagePath: upload.path },
    include: { file: { select: { id: true, name: true } } },
  });
  if (already) {
    return { status: "ok", fileId: already.file.id, fileName: already.file.name, label: already.label, isNewFile: false };
  }

  const { data: info, error } = await storage().info(upload.path);
  if (error || !info) return { status: "missing" };

  const bytes = info.size ?? 0;
  const type = resolveFileType(name, info.contentType ?? "");
  const rejection: UploadRejection | null =
    bytes <= 0 ? "empty" : bytes > MAX_BYTES ? "too-big" : !type ? "bad-type" : null;

  const target = fileId
    ? await db.submittedFile.findFirst({ where: { id: fileId, boxId: box.id } })
    : await db.submittedFile.findFirst({ where: { boxId: box.id, name } });
  if (fileId && !target) throw new Error("파일을 찾을 수 없습니다.");

  const mismatch = target && type && target.kind !== type.kind;
  if (rejection || mismatch || !type) {
    await storage().remove([upload.path]);
    return { status: rejection ?? "kind-mismatch" };
  }

  const file = target ?? (await db.submittedFile.create({ data: { boxId: box.id, name, kind: type.kind } }));
  const versions = await db.fileVersion.findMany({ where: { fileId: file.id } });
  const label = nextVersionLabel(versions);

  await db.fileVersion.create({
    data: {
      fileId: file.id,
      label,
      authorId: me.id,
      // 버전 기록 화면에서 이름이 다른 파일을 올렸으면 원래 이름을 남긴다 — 무엇으로
      // 바꿨는지 기록에서 알 수 있어야 한다.
      note: !target ? `${name} 최초 업로드` : name === file.name ? `${name} 새 버전` : `${name} 으로 새 버전`,
      size: humanSize(bytes),
      kind: type.kind,
      storagePath: upload.path,
      bytes,
      mimeType: type.contentType,
      // 마감을 지나도 제출함을 잠그지 않는다 — 늦게라도 내는 편이 낫고, 대신 라벨이 붙는다.
      isLate: false,
      whenLabel: "방금",
    },
  });

  revalidatePath("/drive", "layout");
  revalidatePath("/home");
  return { status: "ok", fileId: file.id, fileName: file.name, label, isNewFile: !target };
}

/**
 * 내려받을 수 있는 주소를 만들어 준다.
 *
 * 버킷이 비공개라 주소를 그냥 둘 수 없다. 볼 때마다 **짧게 사는 서명된 주소**를 새로
 * 만든다 — 주소가 어딘가에 복사돼도 곧 쓸 수 없게 된다.
 */
const SIGNED_URL_SECONDS = 60;

export async function getDownloadUrl(versionId: string): Promise<string | null> {
  const me = await requireSessionMember();

  const version = await db.fileVersion.findFirst({
    where: { id: versionId, file: { box: { teamId: me.teamId } } },
    select: { storagePath: true, file: { select: { name: true } } },
  });
  // 시드 데이터에는 실제 파일이 없다. 화면이 "내려받을 것이 없다"고 말한다.
  if (!version?.storagePath || !isStorageConfigured()) return null;

  const { data, error } = await storage().createSignedUrl(version.storagePath, SIGNED_URL_SECONDS, {
    download: version.file.name,
  });
  if (error) {
    console.error("[storage] 서명 주소 실패:", error);
    return null;
  }
  return data.signedUrl;
}

/**
 * 앱 안에서 그리기 위한 주소 — 이미지와 PDF. 내려받기가 아니라 화면에 여는 것이다.
 *
 * 내려받기 주소보다 오래 살린다. 브라우저 PDF 뷰어는 큰 파일을 한 번에 받지 않고
 * 넘길 때마다 필요한 부분을 다시 요청해서, 60초짜리 주소로는 읽던 중에 끊긴다.
 * 이 주소로는 "새 탭에서 열기"도 한다.
 */
const PREVIEW_URL_SECONDS = 10 * 60;

export async function getPreviewUrl(versionId: string): Promise<string | null> {
  const me = await requireSessionMember();

  const version = await db.fileVersion.findFirst({
    where: { id: versionId, file: { box: { teamId: me.teamId } } },
    select: { storagePath: true, kind: true, previewUrl: true },
  });
  if (!version) return null;
  // 시드 이미지는 앱 안에 들어 있다.
  if (version.previewUrl) return version.previewUrl;
  if (!canOpenInApp(version.kind as FileKind) || !version.storagePath || !isStorageConfigured()) return null;

  const { data } = await storage().createSignedUrl(version.storagePath, PREVIEW_URL_SECONDS);
  return data?.signedUrl ?? null;
}
