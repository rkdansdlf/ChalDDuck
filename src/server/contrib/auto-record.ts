import "server-only";

import { humanSize } from "@/features/drive/file-rules";
import type { Tx } from "@/server/contrib/state";

/**
 * 기여 자동 수집 (P0 Provenance)
 *
 * 할 일 완료, 드라이브 파일 업로드 등 실제 행동이 일어났을 때 `ContribRecord`를
 * 멱등하게 생성/회수한다.
 *
 * - `originType` 과 `originId` 를 남겨 어떤 원천 행동에서 비롯되었는지 명확히 한다.
 * - `(originType, originId, memberId)` 유니크 제약으로 중복 생성을 방지한다.
 * - 회의 참석은 실제 참석자 출석 데이터가 부재하므로 자동 수집하지 않는다.
 */

/**
 * 할 일이 `done` 으로 완료되었을 때 기여 기록을 자동 생성한다.
 *
 * 담당자(`assigneeId`)가 없으면 기여 주체가 없으므로 기록하지 않는다.
 */
export async function recordTaskDoneContrib(
  tx: Tx,
  task: {
    id: string;
    title: string;
    assigneeId: string | null;
    due?: string | null;
  },
): Promise<void> {
  if (!task.assigneeId) return;

  const existing = await tx.contribRecord.findUnique({
    where: {
      originType_originId_memberId: {
        originType: "task",
        originId: task.id,
        memberId: task.assigneeId,
      },
    },
    select: { id: true },
  });

  if (existing) return;

  await tx.contribRecord.create({
    data: {
      memberId: task.assigneeId,
      kind: "task",
      title: task.title,
      detail: "할 일 완료 (자동 수집)",
      whenLabel: task.due ? `${task.due} 마감` : null,
      source: "auto",
      state: "pending",
      originType: "task",
      originId: task.id,
    },
  });
}

/**
 * 할 일이 `done` 에서 다시 `todo`/`doing` 으로 되돌려졌을 때 기여 기록을 정리한다.
 *
 * - 아직 팀원 확인이 없고(`pending`), 이견이 없는 기록만 안전하게 삭제한다.
 * - 이미 팀원 확인이 끝났거나(`ok`) 의견 차이(`disputed`)가 생긴 기록은
 *   합의와 대화 내역 보호를 위해 조용히 지우지 않는다.
 */
export async function unrecordTaskContrib(tx: Tx, taskId: string): Promise<void> {
  const records = await tx.contribRecord.findMany({
    where: { originType: "task", originId: taskId },
    select: {
      id: true,
      state: true,
      _count: { select: { confirms: true, disputes: true } },
    },
  });

  for (const r of records) {
    if (r.state === "pending" && r._count.confirms === 0 && r._count.disputes === 0) {
      await tx.contribRecord.delete({ where: { id: r.id } });
    }
  }
}

/**
 * 드라이브에 새 파일 버전이 등록되었을 때 기여 기록을 자동 생성한다.
 *
 * 작성자(`authorId`) 기준으로 기록하며, 해당 파일의 저장소 경로와 이름을 증빙으로 연결한다.
 */
export async function recordDriveVersionContrib(
  tx: Tx,
  input: {
    versionId: string;
    fileName: string;
    versionLabel: string;
    authorId: string;
    bytes: number;
    storagePath?: string;
    mimeType?: string;
  },
): Promise<void> {
  const existing = await tx.contribRecord.findUnique({
    where: {
      originType_originId_memberId: {
        originType: "drive_version",
        originId: input.versionId,
        memberId: input.authorId,
      },
    },
    select: { id: true },
  });

  if (existing) return;

  await tx.contribRecord.create({
    data: {
      memberId: input.authorId,
      kind: "file",
      title: `${input.fileName} (${input.versionLabel})`,
      detail: `${humanSize(input.bytes)} 제출 (드라이브 자동 수집)`,
      source: "auto",
      state: "pending",
      originType: "drive_version",
      originId: input.versionId,
      evidencePath: input.storagePath ?? null,
      evidenceName: input.fileName,
      evidenceBytes: input.bytes,
      evidenceMime: input.mimeType ?? null,
    },
  });
}

/**
 * 팀장이 회의 참석을 확인했을 때 기여 기록을 멱등하게 생성한다.
 */
export async function recordMeetingAttendanceContrib(
  tx: Tx,
  input: {
    attendanceId: string;
    meetingId: string;
    memberId: string;
    meetingTitle: string;
    date?: string | null;
  },
): Promise<void> {
  const existing = await tx.contribRecord.findUnique({
    where: {
      originType_originId_memberId: {
        originType: "meeting_attendance",
        originId: input.attendanceId,
        memberId: input.memberId,
      },
    },
    select: { id: true },
  });

  if (existing) return;

  await tx.contribRecord.create({
    data: {
      memberId: input.memberId,
      kind: "meet",
      title: input.meetingTitle,
      detail: "회의 참석 (팀장 출석 확인)",
      whenLabel: input.date ? `${input.date} 회의` : null,
      source: "auto",
      state: "pending",
      originType: "meeting_attendance",
      originId: input.attendanceId,
    },
  });
}

/**
 * 출석 체크가 취소되었을 때 기여 기록을 회수한다.
 *
 * 아직 팀원 확인이나 이견이 없는 대기(`pending`) 상태일 때만 안전하게 삭제한다.
 */
export async function unrecordMeetingAttendanceContrib(
  tx: Tx,
  attendanceId: string,
): Promise<void> {
  const records = await tx.contribRecord.findMany({
    where: { originType: "meeting_attendance", originId: attendanceId },
    select: {
      id: true,
      state: true,
      _count: { select: { confirms: true, disputes: true } },
    },
  });

  for (const r of records) {
    if (r.state === "pending" && r._count.confirms === 0 && r._count.disputes === 0) {
      await tx.contribRecord.delete({ where: { id: r.id } });
    }
  }
}

