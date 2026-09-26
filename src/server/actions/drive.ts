"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { nextVersionLabel } from "@/features/drive/version-label";
import type { FileKind } from "@/lib/types";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import {
  MAX_BYTES,
  TEAM_CAP_BYTES,
  canOpenInApp,
  humanSize,
  isLateVersion,
  resolveFileType,
} from "@/features/drive/file-rules";
import { fromKstInputValue } from "@/lib/when";
import { teamUsedBytes } from "@/server/drive/usage";
import { DRIVE_READ_KEY, readNavBadges, type NavBadges } from "@/server/nav/badges";
import { notify, teamMemberIds } from "@/server/notify/create";
import { isStorageConfigured, storage } from "@/server/storage/client";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * 제출함 하나를 잠그고 그 안에서 일한다.
 *
 * 버전 이름은 "지금 가장 큰 v번호 + 1"이다. 두 사람이 같은 파일을 동시에 올리면 둘 다
 * v3 을 보고 v4 를 만들어 **같은 이름이 둘** 생긴다. 같은 이름의 새 파일을 동시에 올려도
 * 파일이 둘 생긴다. 그래서 이름을 고르고 기록을 만드는 동안은 제출함 행을 잠가 한 명씩
 * 지나가게 한다(`FOR UPDATE`). 한 제출함에 동시에 올리는 사람은 많아야 몇 명이라 기다림은
 * 눈에 띄지 않는다.
 *
 * 유일 제약(@@unique)으로 막지 않은 이유: 운영 DB 에 이미 겹친 이름이 있으면 배포 때
 * 마이그레이션이 실패해 배포 전체가 멈춘다. 그 데이터를 확인할 수 없어 잠금으로 막는다.
 */
async function withBoxLock<T>(boxId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "SubmissionBox" WHERE "id" = ${boxId} FOR UPDATE`;
    return work(tx);
  });
}

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
    include: { box: { select: { name: true } } },
  });
  if (!file) throw new Error("파일을 찾을 수 없습니다.");

  const { label, sourceLabel } = await withBoxLock(file.boxId, async (tx) => {
    const versions = await tx.fileVersion.findMany({ where: { fileId: file.id } });
    const source = versions.find((v) => v.id === versionId);
    if (!source) throw new Error("복원할 버전을 찾을 수 없습니다.");

    const label = nextVersionLabel(versions);
    await tx.fileVersion.create({
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
      // 같은 객체를 가리키므로 용량에도 다시 세지 않는다. 둘 다 이 표시로 가려낸다.
      restoredFromId: source.id,
      },
    });
    return { label, sourceLabel: source.label };
  });

  // 되돌린 것도 팀이 알아야 한다 — 방금 받은 최신 버전이 다른 내용으로 바뀐 것이기 때문이다.
  await notify({
    to: await teamMemberIds(me.teamId),
    actorId: me.id,
    kind: "drive",
    title: `${me.name}님이 ${file.name}을 ${sourceLabel}로 되돌렸습니다`,
    body: `${file.box.name} · ${label}으로 추가됐고 기존 버전은 그대로 있습니다`,
    href: `/drive/${file.boxId}/${file.id}`,
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
  /** 팀 저장 용량(2GB)을 넘는다. */
  | "over-quota"
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

  if ((await teamUsedBytes(me.teamId)) + meta.size > TEAM_CAP_BYTES) return { status: "over-quota" };

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
  upload: { path: string; name: string; note?: string },
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

  const { data: info, error } = await storage().info(upload.path);
  if (error || !info) return { status: "missing" };

  const bytes = info.size ?? 0;
  const type = resolveFileType(name, info.contentType ?? "");
  // 용량은 1단계에서도 봤지만 그사이 다른 팀원이 올렸을 수 있어 실제 크기로 다시 본다.
  const overQuota = (await teamUsedBytes(me.teamId)) + bytes > TEAM_CAP_BYTES;
  const rejection: UploadRejection | null =
    bytes <= 0
      ? "empty"
      : bytes > MAX_BYTES
        ? "too-big"
        : !type
          ? "bad-type"
          : overQuota
            ? "over-quota"
            : null;

  if (rejection || !type) {
    await storage().remove([upload.path]);
    return { status: rejection ?? "bad-type" };
  }

  // 같은 이름 찾기 → 새 파일 만들기 → 다음 버전 이름 고르기 → 기록은 한 사람씩.
  const result = await withBoxLock(box.id, async (tx): Promise<FinishUploadResult> => {
    // 응답이 늦어 화면이 한 번 더 보냈을 때 같은 버전이 둘 생기지 않게. 잠금 안에서 봐야
    // 두 요청이 동시에 "아직 없다"고 보지 않는다.
    const already = await tx.fileVersion.findFirst({
      where: { storagePath: upload.path },
      include: { file: { select: { id: true, name: true } } },
    });
    if (already) {
      return { status: "ok", fileId: already.file.id, fileName: already.file.name, label: already.label, isNewFile: false };
    }

    const target = fileId
      ? await tx.submittedFile.findFirst({ where: { id: fileId, boxId: box.id } })
      : await tx.submittedFile.findFirst({ where: { boxId: box.id, name } });
    if (fileId && !target) throw new Error("파일을 찾을 수 없습니다.");
    if (target && target.kind !== type.kind) return { status: "kind-mismatch" };

    const file = target ?? (await tx.submittedFile.create({ data: { boxId: box.id, name, kind: type.kind } }));
    const versions = await tx.fileVersion.findMany({ where: { fileId: file.id }, select: { label: true } });
    const label = nextVersionLabel(versions);

    await tx.fileVersion.create({
      data: {
        fileId: file.id,
        label,
        authorId: me.id,
        // 올린 사람이 적은 메모가 먼저다 — "3장 그래프 수정" 같은 말이 기여도 리포트의 근거가
        // 된다. 없으면 무엇을 올렸는지만 남긴다(이름이 다르면 원래 이름도).
        note:
          upload.note?.trim().slice(0, 200) ||
          (!target ? `${name} 최초 업로드` : name === file.name ? `${name} 새 버전` : `${name} 으로 새 버전`),
        size: humanSize(bytes),
        kind: type.kind,
        storagePath: upload.path,
        bytes,
        mimeType: type.contentType,
        // 마감을 지나도 제출함을 잠그지 않는다 — 늦게라도 내는 편이 낫고, 대신 라벨이 붙는다.
        // 라벨은 저장하지 않고 제출함 마감과 올린 시각으로 그때그때 계산한다.
      },
    });
    return { status: "ok", fileId: file.id, fileName: file.name, label, isNewFile: !target };
  });

  if (result.status !== "ok") {
    await storage().remove([upload.path]);
    return result;
  }

  revalidatePath("/drive", "layout");
  revalidatePath("/home");
  return result;
}

/**
 * 한 번의 올리기가 끝났음을 팀에 알린다.
 *
 * 파일마다 알리지 않고 **화면의 대기열이 끝날 때 한 번** 부른다 — 다섯 개를 올렸는데 종이
 * 다섯 번 울리면 아무도 알림을 읽지 않게 된다. 여러 개면 "발표 자료.pptx 외 2개"로 묶는다.
 *
 * 화면이 보낸 id 를 그대로 믿지 않는다. **내가 방금(30분 안에) 이 제출함에 올린 버전이 있는
 * 파일**만 알린다 — 남의 파일을 내가 올린 것처럼 알리게 하지 않기 위해서다.
 */
const ANNOUNCE_WINDOW_MS = 30 * 60 * 1000;

export async function announceUploads(boxId: string, fileIds: string[]): Promise<void> {
  const me = await requireSessionMember();

  const box = await db.submissionBox.findFirst({
    where: { id: boxId, teamId: me.teamId },
    select: { id: true, name: true, dueAt: true },
  });
  if (!box || fileIds.length === 0) return;

  const recent = await db.fileVersion.findMany({
    where: {
      authorId: me.id,
      fileId: { in: fileIds.slice(0, 50) },
      file: { boxId: box.id },
      createdAt: { gt: new Date(Date.now() - ANNOUNCE_WINDOW_MS) },
    },
    include: { file: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  // 같은 파일을 여러 번 올렸으면 가장 최근 것 하나로.
  const latestByFile = [...new Map(recent.map((v) => [v.fileId, v])).values()];
  if (latestByFile.length === 0) return;

  const [first] = latestByFile;
  const late = latestByFile.some((v) => isLateVersion(v, box.dueAt));
  const what =
    latestByFile.length === 1 ? `${first.file.name} ${first.label}` : `${first.file.name} 외 ${latestByFile.length - 1}개`;

  await notify({
    to: await teamMemberIds(me.teamId),
    actorId: me.id,
    kind: "drive",
    title: `${me.name}님이 ${box.name}에 올렸습니다`,
    body: late ? `${what} · 마감 후 제출` : what,
    href: latestByFile.length === 1 ? `/drive/${box.id}/${first.file.id}` : `/drive/${box.id}`,
  });
  revalidatePath("/home");
}

/**
 * 드라이브를 열었다고 적는다 — 드라이브 탭 배지("새로 올라온 버전")가 여기서부터 다시 센다.
 *
 * @returns 새로 센 배지. 화면이 바로 탭 숫자를 고친다(다음 폴링까지 30초를 기다리지 않게).
 */
export async function markDriveSeen(): Promise<NavBadges> {
  const me = await requireSessionMember();
  await db.readMark.upsert({
    where: { memberId_threadKey: { memberId: me.id, threadKey: DRIVE_READ_KEY } },
    update: { readAt: new Date() },
    create: { memberId: me.id, threadKey: DRIVE_READ_KEY },
  });
  return readNavBadges(me);
}

/**
 * 제출함 마감을 정하거나 바꾼다. `null` 이면 마감을 없앤다.
 *
 * 마감을 옮기면 "마감 후 제출" 라벨도 따라 바뀐다 — 라벨을 저장하지 않고 이 값으로
 * 계산하기 때문이다. 마감이 지나도 제출함은 잠기지 않는다.
 *
 * @param value `<input type="datetime-local">` 값("2026-09-15T23:59"). 한국 시간으로 읽는다.
 */
export async function setBoxDeadline(boxId: string, value: string | null): Promise<{ ok: boolean }> {
  const me = await requireSessionMember();

  const box = await db.submissionBox.findFirst({ where: { id: boxId, teamId: me.teamId } });
  if (!box) throw new Error("제출함을 찾을 수 없습니다.");

  const dueAt = value === null ? null : fromKstInputValue(value);
  if (value !== null && !dueAt) return { ok: false };

  await db.submissionBox.update({
    where: { id: box.id },
    // 예전 표시 문자열도 맞춰 둔다 — 마감을 없애면 "미정"으로 보여야 한다.
    data: { dueAt, ...(dueAt === null ? { due: "미정" } : {}) },
  });

  revalidatePath("/drive", "layout");
  revalidatePath("/home");
  return { ok: true };
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
