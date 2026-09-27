"use server";

import { revalidatePath } from "next/cache";
import {
  dmThreadKey,
  getDmThreads,
  getNewerMessages,
  getOlderMessages,
  getTeamLastMessage,
  type MessagePage,
} from "@/data/api";
import type { ChatMessage, DmThread } from "@/lib/types";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import { signTeamFileUrl, signTeamUpload, verifyTeamUpload } from "@/server/storage/team-upload";
import type { PrepareUploadResult, UploadRejection } from "@/server/actions/drive";

/**
 * 채팅 서버 액션.
 *
 * `threadId` 는 "team" 또는 상대 팀원의 id 다. DM 방 키는 **서버에서** 만든다 —
 * 화면이 보낸 키를 그대로 쓰면 남의 대화방에 글을 넣을 수 있다.
 */
async function resolveThread(threadId: string, meId: string, teamId: string) {
  if (threadId === "team") return "team";

  const other = await db.member.findFirst({ where: { id: threadId, teamId } });
  if (!other) throw new Error("대화 상대를 찾을 수 없습니다.");
  return dmThreadKey(meId, other.id);
}

/**
 * 한 번에 보낼 수 있는 길이.
 *
 * 입력줄이 `maxLength` 로 먼저 막지만 **서버도 막아야 한다** — 서버 액션은 화면을 거치지
 * 않고 POST 로 바로 불릴 수 있어서, 화면에서 막은 것은 막은 것이 아니다.
 *
 * 자르지 않고 거절한다. 다른 액션(할 일 제목 등)은 넘는 만큼 잘라 내지만, 대화는 잘린
 * 줄을 보낸 사람이 뭘 썼는지 모른 채 보내게 된다. 거절하면 말풍선이 "보내지 못함"으로
 * 남아 원문이 그대로 손에 있다.
 */
const MAX_MESSAGE = 2000;

/** 화면에 보일 시각 문자열. 서버가 포맷해야 사람마다 다르게 보이지 않는다. */
function nowLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

export type SendChatMessageResult =
  | { ok: true; message: { id: string; time: string; sortAt: string } }
  | { ok: false; rejected?: UploadRejection | "missing" };

/**
 * 첨부 올리기 1단계 — 저장소에 직접 올릴 주소. **단톡방만** 받는다.
 *
 * DM 첨부는 기획안에 없다. 경로는 `{teamId}/chat/{uuid}` 이고 드라이브와 같은 규칙이다.
 */
export async function prepareChatAttachment(meta: {
  name: string;
  size: number;
  type: string;
}): Promise<PrepareUploadResult> {
  const me = await requireSessionMember();
  return signTeamUpload(`${me.teamId}/chat/`, meta);
}

export async function sendChatMessage(
  threadId: string,
  text: string,
  /**
   * 쿠션 번역기로 다듬은 말이면 true — 말풍선에 표시가 남는다(19 화면의 약속).
   *
   * `clientId` 는 **같은 내용을 두 번 저장하지 않기 위한 값**이다. 서버가 저장했는데
   * 응답이 늦어 화면이 실패로 바꾸고 사용자가 "다시 보내기"를 누르면, 이 값이 같아서
   * 이미 있는 말을 돌려준다. 예전에는 글이 두 개 생겼다 — 대화의 사실이 틀어지는 일이라
   * 나중에 지우기 어렵다.
   */
  options: {
    viaCushion?: boolean;
    attachment?: { path: string; name: string };
    clientId?: string;
  } = {},
): Promise<SendChatMessageResult> {
  const me = await requireSessionMember();
  const trimmed = text.trim();
  // 파일만 보내는 말은 글이 비어도 된다.
  if (!trimmed && !options.attachment) return { ok: false };
  if (trimmed.length > MAX_MESSAGE) return { ok: false };
  if (options.attachment && threadId !== "team") return { ok: false };

  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  // 저장소에 실제로 들어온 객체를 확인한다 — 규칙에 어긋나면 지우고 말도 남기지 않는다.
  let attach: { attachPath: string; attachName: string; attachBytes: number; attachMime: string } | null = null;
  if (options.attachment) {
    const checked = await verifyTeamUpload(`${me.teamId}/chat/`, options.attachment);
    if (checked.status !== "ok") return { ok: false, rejected: checked.status };
    attach = { attachPath: checked.path, attachName: checked.name, attachBytes: checked.bytes, attachMime: checked.mime };
  }

  // 응답이 늦어 화면이 다시 보냈을 때 같은 말이 둘 생기지 않게.
  // 첨부는 경로로 막고, 글은 화면이 미리 만들어 둔 `clientId` 로 막는다.
  if (options.clientId) {
    const seen = await db.message.findFirst({
      where: { authorId: me.id, clientId: options.clientId },
    });
    if (seen) {
      return {
        ok: true,
        message: { id: seen.id, time: seen.whenLabel, sortAt: seen.createdAt.toISOString() },
      };
    }
  }
  if (attach) {
    const already = await db.message.findFirst({ where: { attachPath: attach.attachPath } });
    if (already) {
      return { ok: true, message: { id: already.id, time: already.whenLabel, sortAt: already.createdAt.toISOString() } };
    }
  }

  const created = await db.message.create({
    data: {
      teamId: me.teamId,
      threadKey,
      authorId: me.id,
      text: trimmed,
      viaCushion: options.viaCushion === true,
      clientId: options.clientId,
      whenLabel: nowLabel(),
      ...attach,
    },
  });

  // 화면은 낙관적으로 이미 보여 줬으니, 여기서는 그 방 경로만 다시 유효하게 만든다 —
  // `/chat` 레이아웃(팀원 목록·최근 자료)까지 매 메시지마다 다시 부를 필요는 없다.
  revalidatePath(threadId === "team" ? "/chat/team" : `/chat/dm/${threadId}`);
  return { ok: true, message: { id: created.id, time: created.whenLabel, sortAt: created.createdAt.toISOString() } };
}

/** 첨부를 여는 주소. 우리 팀 단톡방의 말인지 서버가 확인한다. */
export async function getChatAttachmentUrl(messageId: string): Promise<string | null> {
  const me = await requireSessionMember();
  const message = await db.message.findFirst({
    where: { id: messageId, teamId: me.teamId, threadKey: "team" },
    select: { attachPath: true, attachName: true, attachMime: true },
  });
  if (!message?.attachPath) return null;
  return signTeamFileUrl(message.attachPath, message.attachName ?? "첨부", message.attachMime);
}

/**
 * 드라이브의 파일을 단톡방에 공유한다(14).
 *
 * **바이트를 복사하지 않는다.** 새 버전을 만들지도, 저장소에 다시 올리지도 않고 그 버전만
 * 가리키는 말을 남긴다. 그래서
 * - 팀 용량에 두 번 세지지 않는다,
 * - 드라이브의 버전 이름과 기여 기록이 "누가 무엇을 올렸는가"로 흐려지지 않는다,
 * - 드라이브에서 그 버전을 복원해도 공유한 카드는 원래 이름을 그대로 보여 준다.
 *
 * 올린 사람과 공유한 사람이 다를 수 있다 — 그래서 **공유에도 알림을 따로 보내지 않는다.**
 * 알림은 드라이브에 파일이 새로 생겼을 때의 것이고(13), 공유는 그 말을 단톡방에 쓰는 것이
 * 이미 알림 그 자체다. 여기서 다시 울리면 같은 파일에 종이 두 번 울린다.
 *
 * @param text 곁붙일 말. 비우면 파일만 보낸 말이다(첨부와 같은 규칙).
 */
export async function shareVersionToChat(
  versionId: string,
  text = "",
): Promise<{ ok: true; label: string; fileName: string } | { ok: false }> {
  const me = await requireSessionMember();

  // 화면이 보낸 버전이 정말 우리 팀 것인지 서버에서 확인한다.
  const version = await db.fileVersion.findFirst({
    where: { id: versionId, file: { box: { teamId: me.teamId } } },
    select: { id: true, label: true, file: { select: { id: true, name: true } } },
  });
  if (!version) return { ok: false };

  const body = text.trim().slice(0, MAX_MESSAGE);

  await db.message.create({
    data: {
      teamId: me.teamId,
      threadKey: "team",
      authorId: me.id,
      text: body,
      whenLabel: nowLabel(),
      driveVersionId: version.id,
    },
  });

  // 목록의 마지막 한 줄이 달라지므로 사이드바까지. DM 목록은 손대지 않는다.
  revalidatePath("/chat", "layout");
  return { ok: true, label: version.label, fileName: version.file.name };
}

/** 위로 스크롤해 더 불러오기. `threadId` 가 실제로 내 방인지는 `resolveThread` 가 확인한다. */
export async function loadOlderMessages(threadId: string, cursor: string): Promise<MessagePage> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);
  return getOlderMessages(me.teamId, threadKey, me.id, cursor);
}

/**
 * 열어 둔 방에 **새로 들어온 말**을 가져온다. 화면이 몇 초마다 부른다.
 *
 * 없으면 빈 배열이라 대부분의 호출은 아무것도 돌려주지 않는다 — 그게 정상이다.
 *
 * 새 말이 있으면 읽음 표시도 여기서 함께 밀어 둔다. 방을 열어 두고 보고 있는데
 * 안 읽음이 쌓이면, 그 배지는 "내가 안 본 말"이 아니라 "내가 방을 열어 둔 시간"이 된다.
 * 읽음 표시는 새 말이 실제로 왔을 때만 쓴다 — 조용한 방에서 몇 초마다 쓰기가 나가면
 * 아무 일도 없는 동안 DB 에 쓰기만 쌓인다.
 */
export async function pollNewMessages(
  threadId: string,
  afterId: string | null,
): Promise<ChatMessage[]> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  const fresh = await getNewerMessages(me.teamId, threadKey, me.id, afterId);
  if (fresh.length === 0) return fresh;

  await touchReadMark(me.id, threadKey);
  return fresh;
}

export type SidebarThreads = { teamLast: ChatMessage | null; threads: DmThread[] };

/**
 * 채팅 사이드바(목록)가 몇 초마다 부른다.
 *
 * 방을 열어 둔 화면과 달리 여기는 **어느 방을 보고 있는지 모른다** — 팀 대화
 * 미리보기와 DM 목록 전체(마지막 말·안 읽음 수)를 한 번에 받아 간다. 쿼리는
 * `getTeamLastMessage`(단건) + `getDmThreads`(팀원 수와 무관하게 고정 4개)뿐이라
 * 목록이 길어도 비용이 늘지 않는다.
 */
export async function pollSidebarThreads(): Promise<SidebarThreads> {
  const me = await requireSessionMember();

  const [teamLast, threads] = await Promise.all([
    getTeamLastMessage(me.teamId),
    getDmThreads(me.teamId),
  ]);

  return { teamLast, threads };
}

/** 대화를 열었으면 읽은 것이다 — 목록과 탭 배지의 안 읽음 수가 함께 내려간다. */
export async function markThreadRead(threadId: string): Promise<void> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  await touchReadMark(me.id, threadKey);
  revalidatePath("/chat", "layout");
}

async function touchReadMark(memberId: string, threadKey: string): Promise<void> {
  await db.readMark.upsert({
    where: { memberId_threadKey: { memberId, threadKey } },
    update: { readAt: new Date() },
    create: { memberId, threadKey },
  });
}
