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
import {
  DEFAULT_TONE,
  alignPurified,
  isCushionTone,
  isPurifiableText,
  packPurifyLines,
  PURIFY_BATCH_LIMIT,
  toneChanged,
  toneOf,
  type ReadCushionSetting,
} from "@/lib/read-cushion";
import type { ChatMessage, DmThread } from "@/lib/types";
import { db } from "@/server/db";
import { isAiConfigured } from "@/server/ai/model";
import { runTool } from "@/server/ai/run";
import { softenIncoming } from "@/server/ai/tools";
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

  // **지금 팀에 있는 사람이어야 한다**(`leftAt: null`). 예전에는 팀 소속만 확인해서, 팀을
  // 나간 사람의 방이 그대로 열리고 쓰기도 되었다 — 목록(`getDmThreads`)에는 보이지 않는데
  // 주소만 알면 읽고 쓸 수 있었다. 자리의 다른 곳(`tasks.ts`·`schedule.ts`·`data/api.ts` 의
  // `ACTIVE`)은 여기만 빠르고 있었다.
  const other = await db.member.findFirst({ where: { id: threadId, teamId, leftAt: null } });
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

  // 중복 저장은 **설계된 상황**이다 — 위의 `clientId` 중복 검사(스키마의
  // `@@unique([authorId, clientId])`)는 화면이 한 번 더 눌렀거나, 서버에 이미 저장됐는데
  // 응답만 늦게 온 경우를 막으려고 있다. 그런데 그 검사는 읽고 쓰는 사이가 비어 있어
  // (check-then-act) 두 요청이 함께 지나가면 **둘 다 저장에 도달한다.** 그때 `create` 가
  // `P2002` 를 던지는데, 이 코드의 규칙상 서버가 던진 오류는 운영 빌드에서 문구가 지워져
  // 사용자는 "보내지 못했습니다"만 본다 — 실제로는 이미 저장된 말이다.
  //
  // 그래서 경합은 예외가 아니라 **성공으로 돌려준다.** 저장이 끝난 뒤 그 `clientId` 의 행을
  // 다시 읽어 방금 저장된 말을 그대로 돌려주면, 화면이 고집한 멱등성과 같다.
  let created;
  try {
    created = await db.message.create({
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
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" && options.clientId) {
      const seen = await db.message.findFirst({
        where: { authorId: me.id, clientId: options.clientId },
      });
      if (seen) {
        revalidatePath(threadId === "team" ? "/chat/team" : `/chat/dm/${threadId}`);
        return {
          ok: true,
          message: { id: seen.id, time: seen.whenLabel, sortAt: seen.createdAt.toISOString() },
        };
      }
    }
    // 첨부 경로 경합(`attachPath` 유니크)은 같은 말이 이미 있다는 뜻이므로 그것도 돌려준다.
    if ((error as { code?: string }).code === "P2002" && attach?.attachPath) {
      const already = await db.message.findFirst({ where: { attachPath: attach.attachPath } });
      if (already) {
        revalidatePath(threadId === "team" ? "/chat/team" : `/chat/dm/${threadId}`);
        return {
          ok: true,
          message: { id: already.id, time: already.whenLabel, sortAt: already.createdAt.toISOString() },
        };
      }
    }
    throw error;
  }

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

/* ── 읽기 순화(19 · 31) ────────────────────────────────────── */

/**
 * 이 방의 말을 **어떤 말투로 읽는지** 고른다.
 *
 * **끄는 길이 없다.** 순화는 이 앱의 약속이다(받는 사람은 순화된 표현을 받는다) —
 * 켜고 끄는 스위치를 두면 아무도 켜지 않아 약속이 그대로 남고, 꺼진 화면을 본 사람은
 * 그 말이 순화본인지 원문인지 알 수 없다. 원문은 말풍선을 누르면 된다.
 *
 * 말투는 방마다 따로다. "단톡방은 부드럽게, DM 은 담담하게"가 되어야 한다.
 */
export async function setReadCushionTone(
  threadId: string,
  tone: string,
): Promise<{ ok: true; setting: ReadCushionSetting } | { ok: false; message: string }> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  // 모르는 말투는 그대로 넣지 않는다 — 프롬프트가 `TONE_GUIDE` 에서 못 찾으면 말투 없는
  // 순화가 되고, 사용자는 왜 다른지 알 수 없다.
  const key = isCushionTone(tone) ? tone : DEFAULT_TONE;

  const before = await db.readCushion.findUnique({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    select: { tone: true },
  });

  await db.readCushion.upsert({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    update: { tone: key },
    create: { memberId: me.id, threadKey, tone: key },
  });

  /**
   * 말투가 실제로 바뀌었으면 **이 방의 순화본을 지운다.**
   *
   * 한 말에는 사람당 한 줄(`@@unique([messageId, memberId])`)이다 — 새 말투로 다시
   * 만들어도 예전 글 위에 덮어쓸 수 없다(`skipDuplicates` 는 조용히 버린다). 그러면
   * 사용자는 "부드럽게" 를 눌렀는데 계속 담담하게 된 글을 읽게 된다. 화면에는
   * "다듬는 중" 이 뜨는데 글은 그대로라, 가장 말 없는 실패다.
   *
   * 지우는 것은 **읽기에만 걸린 것**이다. 원문(`Message.text`)은 그대로 남고, 다시 만들면
   * 새 말투로 돌아온다. 같은 말투를 다시 누른 경우에는 지우지 않는다(그냥 저장한다).
   */
  if (toneChanged(before?.tone, key)) {
    await db.messageCushion.deleteMany({
      where: { memberId: me.id, message: { teamId: me.teamId, threadKey } },
    });
  }

  return { ok: true, setting: { tone: key } };
}

export type SoftenThreadResult =
  | { ok: true; purified: Record<string, string>; /** 이번 묶음에서 순화하지 못한 말의 수. */ skipped: number }
  | { ok: false; message: string };

/**
 * 이 방에 도착한 남의 말을 **묶어서** 순화해 둔다.
 *
 * 말 하나마다 한 번씩 부르면 대화방을 한 번 열 때 AI 를 40회 부르는 셈이라, 하루 한도
 * (1인 60회)가 첫 화면에 다 Gone 된다. 그래서 한 묶음을 한 번에 부르고, 한도에서도
 * **묶음 하나가 1회**다.
 *
 * 세 가지를 지킨다.
 * - **방을 확인한다.** `resolveThread` 가 내 방인지 보고, 조회도 그 방 안에서만 한다.
 *   화면이 보낸 id 를 그대로 믿으면 남의 방에 있는 말을 순화해 저장할 수 있다.
 * - **원문은 건드리지 않는다.** 여기서 저장하는 것은 그 사람에게만 보이는 순화문
 *   (`MessageCushion`)이고, `Message.text` 는 그대로다.
 * - **같은 말은 한 번만 순화한다.** 이미 있는 순화본은 다시 만들지 않는다 — 결과가
 *   조금씩 달라질 수 있어, 사용자가 본 말이 조용히 바뀌는 것이 된다.
 *
 * 실패하면 `ok:false` 다. 화면은 그때 **원문 그대로** 보여 준다 — 순화가 안 되는 것보다
 * 대화가 갑자기 다른 말로 보이면 더 나쁘다.
 */
export async function softenThreadMessages(
  threadId: string,
  messageIds: string[],
): Promise<SoftenThreadResult> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  // 키가 없으면 **샘플로 대신하지 않는다.** 보낸 사람은 그 글이 그대로 전달되었는데
  // 읽는 사람에게만 가짜 문장이 붙으면 대화가 거짓말을 하게 된다.
  if (!isAiConfigured()) {
    return { ok: false, message: "AI 가 연결되어 있지 않아 원문으로 읽습니다." };
  }

  const wanted = [...new Set(messageIds)].slice(0, PURIFY_BATCH_LIMIT);
  if (wanted.length === 0) return { ok: true, purified: {}, skipped: 0 };

  // 모르는 말투는 프롬프트가 `TONE_GUIDE` 에서 못 찾는 값이라, 여기서 막는다.
  const saved = await db.readCushion.findUnique({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    select: { tone: true },
  });
  const tone = toneOf({ tone: saved?.tone ?? null });

  // 방 안의 **남의 말**만. 내가 쓴 말과 글 없는 말(파일 첨부만)은 순화 대상이 아니다.
  const rows = await db.message.findMany({
    where: { teamId: me.teamId, threadKey, id: { in: wanted }, authorId: { not: me.id } },
    select: { id: true, text: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const targets = rows.filter((row) => isPurifiableText(row.text));

  /**
   * **이미 순화본이 있는 말은 다시 시키지 않는다.**
   *
   * 두 탭이 같은 말을 동시에 시켜도 `createMany(skipDuplicates)` 는 첫 줄만 남기고
   * 나머지는 **조용히 버린다.** 그러면 화면에는 이번에 새로 받은 글자가 붙는데 새로고침하면
   * 저장된 옛 글자가 다시 나온다 — 읽고 있던 말이 조용히 바뀌는, 이 기능에서 가장 나쁜
   * 일이 된다. 그래서 이미 있는 것은 **저장된 것을 그대로 돌려준다.**
   */
  const stored = await db.messageCushion.findMany({
    where: { memberId: me.id, messageId: { in: targets.map((row) => row.id) } },
    select: { messageId: true, text: true },
  });
  const purified: Record<string, string> = {};
  for (const row of stored) purified[row.messageId] = row.text;

  const fresh = targets.filter((row) => !purified[row.id]);
  if (fresh.length === 0) {
    return { ok: true, purified, skipped: wanted.length - Object.keys(purified).length };
  }

  const { kept } = packPurifyLines(fresh.map((row) => row.text.trim()));
  const batch = fresh.slice(0, kept);
  const originals = batch.map((row) => row.text.trim());

  const result = await runTool("read-cushion", () => softenIncoming(originals, tone));
  if (!result.ok) return { ok: false, message: result.message };

  const aligned = alignPurified(result.value, originals);
  const data: Array<{ messageId: string; memberId: string; text: string; tone: string }> = [];

  for (const [index, text] of aligned.entries()) {
    if (!text) continue;
    purified[batch[index].id] = text;
    data.push({ messageId: batch[index].id, memberId: me.id, text, tone });
  }

  // 두 탭이 같은 말을 동시에 순화해도 한 줄만 남는다(`skipDuplicates`) — 새 행이
  // 쌓이면 그 말의 순화본이 어느 것인지를 고르는 기준이 사라진다.
  if (data.length > 0) {
    await db.messageCushion.createMany({ data, skipDuplicates: true });
  }

  return { ok: true, purified, skipped: wanted.length - Object.keys(purified).length };
}
