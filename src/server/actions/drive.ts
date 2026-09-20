"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { nextVersionLabel } from "@/features/drive/version-label";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import { ALLOWED_MIME, MAX_BYTES, humanSize, isStorageConfigured, storage } from "@/server/storage/client";

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

/** 올리기 결과 — 화면이 무엇이 일어났는지 정확히 말할 수 있게 구분해 준다. */
export type UploadResult =
  | { status: "ok"; fileName: string; label: string; isNewFile: boolean }
  | { status: "too-big" | "bad-type" | "empty" | "not-configured" };

/**
 * 제출함에 파일을 올린다.
 *
 * **같은 이름이면 새 파일이 아니라 그 파일의 새 버전이 된다.** 덮어쓰지 않는다 —
 * 이전 버전은 저장소에 그대로 남고 목록에도 남는다. 이것이 드라이브의 약속이다.
 *
 * 저장소 객체는 **버전마다 하나**다. 같은 경로에 덮어쓰면 옛 버전을 내려받을 때
 * 새 내용이 나와, 목록만 역사이고 내용은 하나인 가짜 버전 기록이 된다.
 */
export async function uploadSubmission(boxId: string, form: FormData): Promise<UploadResult> {
  const me = await requireSessionMember();
  if (!isStorageConfigured()) return { status: "not-configured" };

  const box = await db.submissionBox.findFirst({ where: { id: boxId, teamId: me.teamId } });
  if (!box) throw new Error("제출함을 찾을 수 없습니다.");

  const blob = form.get("file");
  if (!(blob instanceof File) || blob.size === 0) return { status: "empty" };
  if (blob.size > MAX_BYTES) return { status: "too-big" };

  const kind = ALLOWED_MIME[blob.type];
  if (!kind) return { status: "bad-type" };

  // 같은 이름이면 그 파일의 새 버전이다.
  const name = blob.name.trim().slice(0, 200);
  const existing = await db.submittedFile.findFirst({ where: { boxId: box.id, name } });
  const file =
    existing ??
    (await db.submittedFile.create({ data: { boxId: box.id, name, kind } }));

  const versions = await db.fileVersion.findMany({ where: { fileId: file.id } });
  const label = nextVersionLabel(versions);

  // 경로에 임의값을 넣는다 — 파일 이름만으로 만들면 같은 이름의 다음 버전이 앞 버전을
  // 덮어쓰고, 이름을 아는 사람이 경로를 찍어 볼 수도 있다.
  const path = `${box.teamId}/${box.id}/${file.id}/${randomUUID()}`;

  const { error } = await storage().upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) {
    console.error("[storage] 업로드 실패:", error);
    throw new Error("파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  await db.fileVersion.create({
    data: {
      fileId: file.id,
      label,
      authorId: me.id,
      note: existing ? `${name} 새 버전` : `${name} 최초 업로드`,
      size: humanSize(blob.size),
      kind,
      storagePath: path,
      bytes: blob.size,
      mimeType: blob.type,
      // 마감을 지나도 제출함을 잠그지 않는다 — 늦게라도 내는 편이 낫고, 대신 라벨이 붙는다.
      isLate: false,
      whenLabel: "방금",
    },
  });

  revalidatePath("/drive", "layout");
  revalidatePath("/home");
  return { status: "ok", fileName: name, label, isNewFile: !existing };
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

/** 이미지 미리보기용 주소. 내려받기가 아니라 화면에 그리기 위한 것이다. */
export async function getPreviewUrl(versionId: string): Promise<string | null> {
  const me = await requireSessionMember();

  const version = await db.fileVersion.findFirst({
    where: { id: versionId, file: { box: { teamId: me.teamId } } },
    select: { storagePath: true, kind: true, previewUrl: true },
  });
  if (!version) return null;
  // 시드 이미지는 앱 안에 들어 있다.
  if (version.previewUrl) return version.previewUrl;
  if (version.kind !== "image" || !version.storagePath || !isStorageConfigured()) return null;

  const { data } = await storage().createSignedUrl(version.storagePath, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}
