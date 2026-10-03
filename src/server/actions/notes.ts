"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import type { MeetingNote } from "@/lib/types";

export type SaveMeetingNoteInput = {
  meetingId?: string | null;
  title: string;
  rawText: string;
  summary: string;
  taskCount?: number;
};

/**
 * AI 서기 회의록 및 요약본을 DB에 영구 저장한다.
 * 이미 해당 meetingId로 저장된 회의록이 있다면 업데이트하고, 없으면 새로 생성한다.
 */
export async function saveMeetingNote(input: SaveMeetingNoteInput): Promise<MeetingNote> {
  const me = await requireSessionMember();

  const title = input.title.trim().slice(0, 100) || "회의록";
  const rawText = input.rawText.trim();
  const summary = input.summary.trim();
  const taskCount = Math.max(0, input.taskCount ?? 0);
  const meetingId = input.meetingId ? input.meetingId.trim() : null;

  // meetingId가 주어졌다면 해당 회의가 현재 팀에 속하는지 검증
  if (meetingId) {
    const meeting = await db.meetingProposal.findFirst({
      where: { id: meetingId, teamId: me.teamId },
    });
    if (!meeting) {
      throw new Error("연결할 회의를 찾을 수 없습니다.");
    }
  }

  let noteRecord;

  if (meetingId) {
    // 1:1 관계 upsert
    noteRecord = await db.meetingNote.upsert({
      where: { meetingId },
      create: {
        teamId: me.teamId,
        meetingId,
        title,
        rawText,
        summary,
        taskCount,
        createdById: me.id,
      },
      update: {
        title,
        rawText,
        summary,
        taskCount,
        updatedAt: new Date(),
      },
      include: {
        createdBy: {
          select: { name: true },
        },
      },
    });
  } else {
    noteRecord = await db.meetingNote.create({
      data: {
        teamId: me.teamId,
        title,
        rawText,
        summary,
        taskCount,
        createdById: me.id,
      },
      include: {
        createdBy: {
          select: { name: true },
        },
      },
    });
  }

  revalidatePath("/schedule/calendar");
  revalidatePath("/schedule/slots");
  revalidatePath("/tools/clerk");

  return {
    id: noteRecord.id,
    teamId: noteRecord.teamId,
    meetingId: noteRecord.meetingId,
    title: noteRecord.title,
    rawText: noteRecord.rawText,
    summary: noteRecord.summary,
    taskCount: noteRecord.taskCount,
    createdById: noteRecord.createdById,
    createdByName: noteRecord.createdBy?.name ?? null,
    createdAt: noteRecord.createdAt.toISOString(),
    updatedAt: noteRecord.updatedAt.toISOString(),
  };
}

/**
 * 특정 회의(proposal)에 연결된 회의록을 조회하는 서버 액션.
 * 클라이언트 컴포넌트(Sheet 등)에서 안전하게 호출할 수 있다.
 */
export async function getMeetingNoteByProposalAction(meetingId: string): Promise<MeetingNote | null> {
  const me = await requireSessionMember();

  const note = await db.meetingNote.findFirst({
    where: { meetingId, teamId: me.teamId },
    include: { createdBy: { select: { name: true } } },
  });
  if (!note) return null;

  return {
    id: note.id,
    teamId: note.teamId,
    meetingId: note.meetingId,
    title: note.title,
    rawText: note.rawText,
    summary: note.summary,
    taskCount: note.taskCount,
    createdById: note.createdById,
    createdByName: note.createdBy?.name ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function getMeetingNoteAction(noteId: string): Promise<MeetingNote | null> {
  const me = await requireSessionMember();

  const note = await db.meetingNote.findFirst({
    where: { id: noteId, teamId: me.teamId },
    include: { createdBy: { select: { name: true } } },
  });
  if (!note) return null;

  return {
    id: note.id,
    teamId: note.teamId,
    meetingId: note.meetingId,
    title: note.title,
    rawText: note.rawText,
    summary: note.summary,
    taskCount: note.taskCount,
    createdById: note.createdById,
    createdByName: note.createdBy?.name ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

