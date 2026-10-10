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
import { isStorageConfigured, explainStorageFailure, storage } from "@/server/storage/client";
import { recordDriveVersionContrib } from "@/server/contrib/auto-record";

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
 * **팀**을 잠그고 그 안에서 일한다 — 용량 한도를 지키기 위한 잠금.
 *
 * `withBoxLock` 은 제출함 하나만 지킨다. 그래도 충분하지 않았다: 팀 저장 용량(2GB)은
 * **팀 전체**의 합인데 판정은 제출함 밖에서 갔고, 그 잠금조차 상자별이라 서로 다른 상자로
 * 들어온 동시 업로드는 아예 만나지 않았다. 한 팀이 세 제출함에 50MB씩 동시에 올리면 셋 다
 * "0 바이트"를 보고 셋 다 통과해 2GB를 넘는다(파일을 다시 waves로 올리면 무한히).
 *
 * 그래서 잠금의 **범위를 팀으로** 올린다. `Team` 행은 언제나 존재하고 한 팀에 하나뿐이므로
 * 안정적인 잠금 대상이고, 한 팀의 동시 업로드는 많지 않아 기다림이 눈에 띄지 않는다.
 * (`server/ai/limit.ts` 가 AI 한도를 지키며 같은 방식으로 팀 행을 잡는다.)
 *
 * 제출함 이름까지 같이 필요하면 `withTeamBoxLock` 을 쓴다 — **Team 을 먼저, 그다음
 * SubmissionBox** 순서를 어기지 않는다(어긋나면 두 요청이 서로를 기다리는 교착이 생긴다).
 */
async function withTeamLock<T>(teamId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Team" WHERE "id" = ${teamId} FOR UPDATE`;
    return work(tx);
  });
}

/** 팀을 잠근 다음 제출함을 잠근다. 순서는 항상 이렇다. */
async function withTeamBoxLock<T>(
  teamId: string,
  boxId: string,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withTeamLock(teamId, async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "SubmissionBox" WHERE "id" = ${boxId} FOR UPDATE`;
    return work(tx);
  });
}

/**
 * 22 파일 복원 서버 액션.
 *
 * 핵심 규칙: **복원은 덮어쓰기가 아니라 새 버전 추가다.** 옛 버전으로 되돌려도 그 사이의
 * 작업이 사라지지 않아야 하고, 되돌린 것 자체도 누가 언제 했는지 기록에 남아야 한다
 * — 이 기록은 기여 기록 리포트의 근거로도 쓰인다.
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

    // 권한 검사: 본인이 올린 버전이거나 팀장만 이전 버전으로 복원할 수 있다.
    if (source.authorId !== me.id && !me.isLeader) {
      throw new Error("본인이 올린 버전이거나 팀장만 이전 버전으로 복원할 수 있습니다.");
    }

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
    // 버킷이 없으면 "저장소가 응답하지 않습니다" 로 넘기지 않는다 — 원인이 다르다.
    // 버킷 부재는 `npm run db:storage` 한 줄로 끝나고, 잠깐 실패한 것과 메시지도 다르다.
    const problem = await explainStorageFailure("올리기 주소 발급", error);
    if (problem.missingBucket) return { status: "not-configured" };
    throw new Error(problem.message);
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

  // **확실히 틀린 것만 잠금 밖에서 먼저 본다** — 저장소를 만질 필요가 없다. 용량은
  // 여기서 보지 않는다: 팀 전체의 합이고, 아래 잠금 안에서 다시 세야 한다.
  const obvious: UploadRejection | null =
    bytes <= 0 ? "empty" : bytes > MAX_BYTES ? "too-big" : !type ? "bad-type" : null;
  if (obvious || !type) {
    await storage().remove([upload.path]);
    return { status: obvious ?? "bad-type" };
  }

  // **팀을 잠근다** — 용량(2GB)이 팀 전체의 합이기 때문이다. 예전에는 이 판정이 잠금 밖에서
  // 갔고 그 잠금조차 제출함별이라, 서로 다른 제출함으로 동시에 올리는 사람들은 서로를 보지
  // 못하고 **모두 "여유 있다"를 보고** 2GB를 넘겼다. 지금 크기로 다시 보는 것도 그대로지만,
  // 그것만으로는 부족했다 — 보는 것과 막는 것이 한 자리에 있어야 한다.
  //
  // 잠금 안에서는 두 가지를 함께 한다: 용량 판정과 버전 이름 고르기. 후자는 원래
  // 제출함 잠그기로 지켰던 그것이다(같은 이름의 새 버전이 둘 생기지 않게).
  const result = await withTeamBoxLock(me.teamId, box.id, async (tx): Promise<FinishUploadResult> => {
    // **먼저** 이 경로가 이미 기록돼 있는지 본다. 순서가 규칙이다(2026-09-28 수정).
    //
    // 응답이 늦어 화면이 한 번 더 보냈을 때 같은 버전이 둘 생기지 않게. 잠금 안에서 봐야
    // 두 요청이 동시에 "아직 없다"고 보지 않는다.
    //
    // 예전에는 이 검사가 **용량 검사 뒤** 에 있었다. 그래서 팀이 꽉 찬 뒤에 화면이 같은
    // 응답을 다시 보내면 '저장 용량이 가득 찼습니다' 로 돌아갔고, 더 나쁜 일이 이어졌다 —
    // 실패한 올리기 뒤의 정리(`storage().remove`)가 **이미 기록된 객체를 지웠다.**
    // 업로드는 성공했는데 파일이 사라지고, 버전 행만 남은 채 미리보기가 404 가 된다
    // (드라이브 통합 검사가 이 순서를 뒤집기 전까지 이 상태였다).
    //
    // 중복 응답은 **이미 일어난 일이므로** 용량과 무관하다. 용량은 아직 쓰이지 않은 객체에
    // 대해서만 의미가 있다.
    const already = await tx.fileVersion.findFirst({
      where: { storagePath: upload.path },
      include: { file: { select: { id: true, name: true } } },
    });
    if (already) {
      return { status: "ok", fileId: already.file.id, fileName: already.file.name, label: already.label, isNewFile: false };
    }

    // 아직 안 쓰인 객체다(위의 `already` 검사 아래) — 여기서 세는 값이 곧 늘어난다.
    if ((await teamUsedBytes(me.teamId, tx)) + bytes > TEAM_CAP_BYTES) {
      return { status: "over-quota" };
    }

    const target = fileId
      ? await tx.submittedFile.findFirst({ where: { id: fileId, boxId: box.id } })
      : await tx.submittedFile.findFirst({ where: { boxId: box.id, name } });
    if (fileId && !target) throw new Error("파일을 찾을 수 없습니다.");
    if (target && target.kind !== type.kind) return { status: "kind-mismatch" };

    const file = target ?? (await tx.submittedFile.create({ data: { boxId: box.id, name, kind: type.kind } }));
    const versions = await tx.fileVersion.findMany({ where: { fileId: file.id }, select: { label: true } });
    const label = nextVersionLabel(versions);

    const version = await tx.fileVersion.create({
      data: {
        fileId: file.id,
        label,
        authorId: me.id,
        // 올린 사람이 적은 메모가 먼저다 — "3장 그래프 수정" 같은 말이 기여 기록 리포트의 근거가
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

    await recordDriveVersionContrib(tx, {
      versionId: version.id,
      fileName: file.name,
      versionLabel: label,
      authorId: me.id,
      bytes,
      storagePath: upload.path,
      mimeType: type.contentType,
    });

    return { status: "ok", fileId: file.id, fileName: file.name, label, isNewFile: !target };
  });

  if (result.status !== "ok") {
    await storage().remove([upload.path]);
    return result;
  }

  revalidatePath("/drive", "layout");
  revalidatePath("/team/contrib", "layout");
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
  // 같은 파일을 여러 번 올렸으면 가장 최근 것 하나로. `recent` 는 최신순이므로 **먼저 나온 것**이
  // 최근이다 — `new Map(entries)` 는 중복 키에서 마지막 값을 쓰므로 가장 오래된 버전이 남았다
  // (알림에는 "v1" 이라고 쓰이고, 마감 후 제출 판정도 오래된 버전으로 갔다).
  const latestByFile: typeof recent = [];
  const seen = new Set<string>();
  for (const v of recent) {
    if (seen.has(v.fileId)) continue;
    seen.add(v.fileId);
    latestByFile.push(v);
  }
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
 * 채팅에 붙인 파일을 제출함에 올린다(14). 단톡방 첨부 → 드라이브.
 *
 * **바이트를 복사하지 않는다.** 채팅에 이미 올라간 저장소 객체를 그대로 가리키는 버전을
 * 하나 세운다. 용량에 두 번 세어지지 않으려고 하지 않는다 — 올린 뒤엔 그것이 드라이브
 * 파일이므로 팀 용량에 **한 번** 세는 것이 맞다. (채팅 첨부 자체를 용량에 넣을지는 2번
 * 항목이라 아직 하지 않는다.)
 *
 * 기록의 주인은 **파일을 만든 사람**이다. 단톡방에 내가 올린 파일일 수도 있고 팀원이 올린
 * 파일일 수도 있는데, `authorId` 를 눌러 누가 드라이브에 올렸는지로 잡으면 기여 기록에
 * 엉뚱한 사람이 남는다 — 드라이브는 "누가 무엇을 만들었는가"를 사실로 남기는 곳이다.
 * 내가 대신 올렸다는 사실은 버전 메모와 알림에 남긴다.
 *
 * 마감은 평소 올리기와 똑같이 본다. 제출함이 마감한 뒤에야 드라이브에 들어온 것이니
 * "마감 후 제출" 라벨이 붙는 것이 맞다. 메모에 단톡방에서 왔다는 말이 함께 남는다.
 *
 * 중복은 만들지 않는다 — 같은 첨부를 두 번 올리면 용량과 버전 이름이 두 번 나간다.
 * 잠금 안에서 다시 확인한다.
 */
export type SaveAttachmentResult =
  | { status: "ok"; label: string; fileName: string; boxName: string }
  | { status: UploadRejection | "missing" | "already-saved" };

export async function saveChatAttachmentToDrive(
  messageId: string,
  boxId: string,
): Promise<SaveAttachmentResult> {
  const me = await requireSessionMember();

  const box = await db.submissionBox.findFirst({
    where: { id: boxId, teamId: me.teamId },
    // 마감을 여기서 보지 않는다 — "마감 후 제출" 은 저장하지 않고 제출함 마감과 버전의
    // `createdAt` 으로 그때그때 계산한다(`isLateVersion`).
    select: { id: true, name: true },
  });
  if (!box) return { status: "missing" };

  // 우리 팀 **단톡방**의 말인지, 첨부가 있는지 — DM 첨부는 기획에 없어 애초에 생기지 않는다.
  const message = await db.message.findFirst({
    where: { id: messageId, teamId: me.teamId, threadKey: "team" },
    select: {
      id: true,
      attachPath: true,
      attachName: true,
      attachBytes: true,
      attachMime: true,
      authorId: true,
      savedVersionId: true,
    },
  });
  if (!message?.attachPath || !message.attachName) return { status: "missing" };
  if (message.savedVersionId) return { status: "already-saved" };

  // 이름·경로를 지역 상수로 둔다. 아래 잠금 콜백 안에서는 TypeScript 가 이 속성의 좁힘을
  // 지운다(`message.attachName` 이 `string | null` 이 되돌아온다).
  const attachName = message.attachName;
  const attachPath = message.attachPath;

  // 올릴 때와 같은 규칙을 다시 본다. 첨부 시점에 통과했지만 형식 판정은 이름과 MIME 로 하므로
  // 여기서도 같은 값을 얻는다 — 한 군데서 한 번만 검사하게 두면 나중에 한쪽만 고치게 된다.
  const type = resolveFileType(attachName, message.attachMime ?? "");
  if (!type) return { status: "bad-type" };

  const bytes = message.attachBytes ?? 0;
  if (bytes <= 0) return { status: "empty" };
  if (bytes > MAX_BYTES) return { status: "too-big" };

  const result = await withTeamBoxLock(me.teamId, box.id, async (tx): Promise<SaveAttachmentResult> => {
    // **용량 판정은 잠금 안에서 한다.** 팀 전체의 합이므로 팀을 잡고 세어야 한다 — 올리기
    //(`finishUpload`)와 같은 이유, 같은 잠금. 예전에는 잠금 밖에서 세었고 그 잠금조차
    // 상자별이라, 단톡방 파일을 드라이브로 옮기는 동시 요청이 2GB를 넘겨도 서로를 보지
    // 못했다. 여기서 막혔다고 **저장소 객체를 지우지 않는다** — 그건 이미 단톡방에 붙어 있는
    // 파일이므로, 거절은 "드라이브에 못 넣는다"까지만이다.
    if ((await teamUsedBytes(me.teamId, tx)) + bytes > TEAM_CAP_BYTES) return { status: "over-quota" };

    /**
     * ⚠️ **이 재확인은 같은 순간에 눌렀을 때만 일한다** — 2026-09-28 에 확인했다. 순차로 두 번
     * 누르면 **여기 위의 첫 검사**(`message.savedVersionId`)가 잡아서, 이 줄을 지워도 아무 일도
     * 드러나지 않는다. 그래서 `test:drive` 는 **동시에** 두 번 보낸다 — 이 줄을 빼면 버전이
     * **2 개** 생긴다.
     */
    // 잠금 안에서 다시 본다 — 두 번 눌렀을 때 두 버전이 생기면 용량에 두 번 세어진다.
    const fresh = await tx.message.findUnique({ where: { id: message.id }, select: { savedVersionId: true } });
    if (fresh?.savedVersionId) return { status: "already-saved" };

    const target = await tx.submittedFile.findFirst({ where: { boxId: box.id, name: attachName } });
    if (target && target.kind !== type.kind) return { status: "kind-mismatch" };

    const file =
      target ?? (await tx.submittedFile.create({ data: { boxId: box.id, name: attachName, kind: type.kind } }));
    const versions = await tx.fileVersion.findMany({ where: { fileId: file.id }, select: { label: true } });
    const label = nextVersionLabel(versions);

    const version = await tx.fileVersion.create({
      data: {
        fileId: file.id,
        label,
        // 파일을 만든 사람. 내가 단톡방에서 받아 올렸어도 이건 그 사람의 파일이다.
        authorId: message.authorId,
        note: `${attachName} 단톡방에서 올림`,
        size: humanSize(bytes),
        kind: type.kind,
        // 같은 저장소 객체를 가리킨다 — 복사하지 않는다. 그래서 이 버전을 내려받으면
        // 단톡방에 올렸던 그 파일이 나온다.
        storagePath: attachPath,
        bytes,
        mimeType: type.contentType,
      },
    });

    await recordDriveVersionContrib(tx, {
      versionId: version.id,
      fileName: file.name,
      versionLabel: label,
      authorId: message.authorId,
      bytes,
      storagePath: attachPath,
      mimeType: type.contentType,
    });

    await tx.message.update({ where: { id: message.id }, data: { savedVersionId: version.id } });
    return { status: "ok", label, fileName: file.name, boxName: box.name };
  });

  if (result.status !== "ok") return result;

  // 드라이브에 파일이 들어갔으니 팀에 알린다 — 13 과 같은 알림이다.
  await notify({
    to: await teamMemberIds(me.teamId),
    actorId: me.id,
    kind: "drive",
    title: `${me.name}님이 ${result.fileName}을 드라이브에 올렸습니다`,
    body: `${result.boxName} · 단톡방 파일 · ${result.label}`,
    href: `/drive/${box.id}`,
  });

  revalidatePath("/drive", "layout");
  revalidatePath("/team/contrib", "layout");
  revalidatePath("/chat", "layout");
  revalidatePath("/home");
  return result;
}

/**
 * 제출함 마감을 정하거나 바꾼다. `null` 이면 마감을 없앤다.
 *
 * 권한: 제출함 담당자(ownerId === me.id) 또는 팀장(me.isLeader)만 변경할 수 있다.
 * 마감 변경 시 `DeadlineChange` 이력을 기록하고 팀원들에게 알림을 발송한다.
 *
 * @param value `<input type="datetime-local">` 값("2026-09-15T23:59"). 한국 시간으로 읽는다.
 * @param reason 마감 변경 사유 (옵션)
 */
export async function setBoxDeadline(
  boxId: string,
  value: string | null,
  reason?: string,
): Promise<{ ok: boolean }> {
  const me = await requireSessionMember();

  const box = await db.submissionBox.findFirst({ where: { id: boxId, teamId: me.teamId } });
  if (!box) throw new Error("제출함을 찾을 수 없습니다.");

  // 권한 검사: 제출함 담당자 또는 팀장만 변경할 수 있다.
  const isOwner = box.ownerId === me.id;
  if (!isOwner && !me.isLeader) {
    throw new Error("제출함 담당자 또는 팀장만 마감을 변경할 수 있습니다.");
  }

  const dueAt = value === null ? null : fromKstInputValue(value);
  if (value !== null && !dueAt) return { ok: false };

  // 마감 시간이 실제로 변경되었는지 확인
  const isChanged =
    (box.dueAt === null && dueAt !== null) ||
    (box.dueAt !== null && dueAt === null) ||
    (box.dueAt !== null && dueAt !== null && box.dueAt.getTime() !== dueAt.getTime());

  if (isChanged) {
    await db.$transaction(async (tx) => {
      await tx.submissionBox.update({
        where: { id: box.id },
        // 예전 표시 문자열도 맞춰 둔다 — 마감을 없애면 "미정"으로 보여야 한다.
        data: { dueAt, ...(dueAt === null ? { due: "미정" } : {}) },
      });

      await tx.deadlineChange.create({
        data: {
          boxId: box.id,
          changedById: me.id,
          previousDueAt: box.dueAt,
          newDueAt: dueAt,
          reason: reason?.trim() ? reason.trim() : null,
        },
      });
    });

    const newDueLabel = dueAt
      ? `${dueAt.getMonth() + 1}/${dueAt.getDate()} ${String(dueAt.getHours()).padStart(2, "0")}:${String(dueAt.getMinutes()).padStart(2, "0")}`
      : "마감 없음";
    const reasonText = reason?.trim() ? ` (사유: ${reason.trim()})` : "";

    await notify({
      to: await teamMemberIds(me.teamId),
      actorId: me.id,
      kind: "drive",
      title: `${me.name}님이 ${box.name} 마감을 변경했습니다`,
      body: `변경 후: ${newDueLabel}${reasonText}`,
      href: `/drive/${box.id}`,
    });
  }

  revalidatePath("/drive", "layout");
  revalidatePath("/home");
  return { ok: true };
}

/**
 * 제출함 마감 변경 이력을 조회한다.
 * 최신 변경 내역이 맨 위에 오도록 정렬한다.
 */
export async function getDeadlineHistory(boxId: string): Promise<Array<{
  id: string;
  boxId: string;
  changedBy: string;
  previousDue: string;
  newDue: string;
  reason: string | null;
  createdAt: string;
}>> {
  const me = await requireSessionMember();

  const box = await db.submissionBox.findFirst({
    where: { id: boxId, teamId: me.teamId },
    select: { id: true },
  });
  if (!box) throw new Error("제출함을 찾을 수 없습니다.");

  const changes = await db.deadlineChange.findMany({
    where: { boxId },
    include: { changedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return changes.map((c) => ({
    id: c.id,
    boxId: c.boxId,
    changedBy: c.changedBy.name,
    previousDue: c.previousDueAt
      ? `${c.previousDueAt.getMonth() + 1}/${c.previousDueAt.getDate()} ${String(c.previousDueAt.getHours()).padStart(2, "0")}:${String(c.previousDueAt.getMinutes()).padStart(2, "0")}`
      : "미정",
    newDue: c.newDueAt
      ? `${c.newDueAt.getMonth() + 1}/${c.newDueAt.getDate()} ${String(c.newDueAt.getHours()).padStart(2, "0")}:${String(c.newDueAt.getMinutes()).padStart(2, "0")}`
      : "마감 없음",
    reason: c.reason,
    createdAt: c.createdAt.toISOString(),
  }));
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
    // 조용히 `null` 을 돌려주면 멀쩡한 파일을 없는 파일이라고 말하게 된다. 버킷 부재와
    // 잠깐 실패를 나눠 **서버 로그에**는 원인을 남긴다.
    await explainStorageFailure("내려받기 주소 발급", error);
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
 *
 * **`fileId` 로도 묶는다.** 예전에는 팀 안의 어떤 버전인지만 확인했다. 그래서 주소를
 * `/drive/<boxA>/<fileA>/<fileB의버전>` 으로 바꿔치기하면 **A 파일의 이름·작성자·크기·마감
 * 배지 위에 B 파일의 그림**이 그려졌다. 팀 안에서만 빠지는 건이라 보안은 아니지만,
 * 아무도 엉뚱한 줄을 고칠 이유가 없다.
 */
const PREVIEW_URL_SECONDS = 10 * 60;

export async function getPreviewUrl(versionId: string, fileId?: string): Promise<string | null> {
  const me = await requireSessionMember();

  const version = await db.fileVersion.findFirst({
    where: {
      id: versionId,
      file: { box: { teamId: me.teamId }, ...(fileId ? { id: fileId } : {}) },
    },
    select: { storagePath: true, kind: true, previewUrl: true },
  });
  if (!version) return null;
  // 시드 이미지는 앱 안에 들어 있다.
  if (version.previewUrl) return version.previewUrl;
  if (!canOpenInApp(version.kind as FileKind) || !version.storagePath || !isStorageConfigured()) return null;

  // 서명 주소를 못 만들면 **왜인지 서버에 남긴다.** 조용히 `null` 을 돌려주면 화면은
  // "이 버전에는 저장된 파일이 없어 미리 볼 수 없습니다"라고 말해 — 멀쩡한 파일을
  // 없는 파일이라고 말하기 때문이다.
  const { data, error } = await storage().createSignedUrl(version.storagePath, PREVIEW_URL_SECONDS);
  if (error) {
    await explainStorageFailure(`미리보기 주소 발급 (${version.storagePath})`, error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * 리서처 등 도구에서 저장할 대상 제출함 목록을 조회한다.
 */
export async function getMyTeamSubmissionBoxesForSelect(): Promise<
  Array<{ id: string; name: string; role: string }>
> {
  const me = await requireSessionMember();
  const boxes = await db.submissionBox.findMany({
    where: { teamId: me.teamId },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return boxes;
}

/**
 * AI 리서치 결과를 선택한 제출함에 PDF 문서로 저장한다.
 */
export async function saveResearchToDrive(
  boxId: string,
  research: {
    title: string;
    source: string;
    snippet: string;
    url?: string | null;
    year?: string | null;
    citation?: string | null;
  },
): Promise<
  | { ok: true; fileName: string; boxName: string; boxId: string }
  | { ok: false; error: string }
> {
  try {
    const me = await requireSessionMember();

    const box = await db.submissionBox.findFirst({
      where: { id: boxId, teamId: me.teamId },
      select: { id: true, name: true },
    });
    if (!box) return { ok: false, error: "제출함을 찾을 수 없습니다." };

    const cleanTitle = research.title.replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 30) || "자료";
    const fileName = `[자료] ${cleanTitle}.pdf`;
    const mimeType = "application/pdf";
    const kind = "pdf";

    const pdfBody = makeMinimalPdfText(
      `${research.title}\n출처: ${research.source}${research.year ? ` (${research.year})` : ""}\n${research.snippet}\n${research.url ?? ""}`,
    );
    const bytes = pdfBody.length;

    const result = await withTeamBoxLock(me.teamId, box.id, async (tx) => {
      // 올리기(`finishUpload`)와 같은 약속이다 — 팀 저장 용량(2GB)은 **팀 전체의 합**이고, 지키는 곳은
      // 이 잠금 안이다. 작은 PDF 라도 가득 찬 팀에 계속 쌓이면 한도가 한도가 아니다. 저장소에 올리기
      // **전에** 본다 — 거절하고 나서 객체만 남지 않게.
      if ((await teamUsedBytes(me.teamId, tx)) + bytes > TEAM_CAP_BYTES) {
        throw new Error("팀 저장 용량이 가득 차 저장할 수 없습니다.");
      }

      const target = await tx.submittedFile.findFirst({ where: { boxId: box.id, name: fileName } });
      const file =
        target ?? (await tx.submittedFile.create({ data: { boxId: box.id, name: fileName, kind } }));
      const versions = await tx.fileVersion.findMany({ where: { fileId: file.id }, select: { label: true } });
      const label = nextVersionLabel(versions);

      const versionId = randomUUID();
      const storagePath = `${me.teamId}/${file.id}/${versionId}`;

      if (isStorageConfigured()) {
        const { error: uploadError } = await storage().upload(storagePath, pdfBody, {
          contentType: mimeType,
          upsert: true,
        });
        if (uploadError) {
          // **기록을 남기지 않는다.** 예전에는 로그만 찍고 버전 행을 만들었다 — 객체가 없는 버전은
          // 미리보기가 404 가 되고, 팀은 파일이 있다고 믿는다(올리기가 실패했을 때 객체를 지우는
          // 것과 같은 이유다). 던지면 이 트랜잭션이 되돌려져 파일·버전·기여 기록이 모두 사라진다.
          console.error("[drive] 리서치 PDF 업로드 실패:", uploadError);
          throw new Error("파일을 저장소에 올리지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
        }
      }

      const version = await tx.fileVersion.create({
        data: {
          id: versionId,
          fileId: file.id,
          label,
          authorId: me.id,
          note: `AI 리서처에서 저장한 참고자료 (${research.source})`,
          size: humanSize(bytes),
          kind,
          storagePath: isStorageConfigured() ? storagePath : null,
          bytes,
          mimeType,
        },
      });

      await recordDriveVersionContrib(tx, {
        versionId: version.id,
        fileName: file.name,
        versionLabel: label,
        authorId: me.id,
        bytes,
        storagePath: version.storagePath ?? undefined,
        mimeType,
      });

      return { fileName: file.name, boxName: box.name, boxId: box.id };
    });

    await notify({
      to: await teamMemberIds(me.teamId),
      actorId: me.id,
      kind: "drive",
      title: `${me.name}님이 참고자료를 드라이브에 저장했습니다`,
      body: `${result.boxName} · ${result.fileName}`,
      href: `/drive/${box.id}`,
    });

    revalidatePath("/drive", "layout");
    return { ok: true, fileName: result.fileName, boxName: result.boxName, boxId: result.boxId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "드라이브 저장에 실패했습니다.",
    };
  }
}

function makeMinimalPdfText(text: string): Buffer {
  const safeText = text.replace(/[()\\\r\n]/g, " ").slice(0, 200);
  const stream = `BT /F1 12 Tf 50 700 Td (${safeText}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${stream.length} >>
stream
${stream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000318 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
${400 + stream.length}
%%EOF`;
  return Buffer.from(pdf, "utf-8");
}
