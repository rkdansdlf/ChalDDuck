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
  CUSHION_REASON,
  CLAIM_TTL_MS,
  FAILURE_BACKOFF_MS,
  PROMPT_VERSION,
  PURIFY_BATCH_LIMIT,
  VALIDATOR_VERSION,
  canRetry,
  isCushionTone,
  isPurifiableText,
  isRefusal,
  judgeOne,
  maskRiskyParts,
  packPurifyItems,
  parsePurifyResponse,
  toneChanged,
  toneOf,
  type CushionReason,
  type CushionStatus,
  type ReadCushionSetting,
} from "@/lib/read-cushion";
import type { ChatMessage, DmThread } from "@/lib/types";
import { db } from "@/server/db";
import { runTool } from "@/server/ai/run";
import { softenIncoming } from "@/server/ai/tools";
import { requireSessionMember } from "@/server/session";
import { activeModelId } from "@/server/ai/model";
import { randomUUID, createHash } from "node:crypto";
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
  const key = isCushionTone(tone) ? tone : toneOf({ tone: null });

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
      where: { viewerId: me.id, message: { teamId: me.teamId, threadKey } },
    });
  }

  return { ok: true, setting: { tone: key } };
}

/** 순화 상태 하나 — 화면이 그대로 그리는 값. */
export type CushionView =
  | { status: "PURIFIED" | "FALLBACK"; text: string; kind: "ai" | "mask"; reason: null; retryAfter: null }
  | { status: "PENDING" | "REJECTED" | "FAILED"; text: null; kind: null; reason: string | null; retryAfter: string | null };

export type SoftenThreadResult =
  | {
      ok: true;
      /** 요청한 모든 말의 현재 상태. 못 부른 말도 **저장된 상태 그대로** 돌아온다. */
      cushions: Record<string, CushionView>;
      /** 이 번에 실제로 모델을 부른 묶음 수(관측용). */
      called: number;
      /**
       * 이 방에 **아직 손대지 않은 대상 말**이 몇 개 남았나.
       *
       * 화면은 이 값이 0 이 될 때까지 **곧바로** 다음 묶음을 부른다. 3초 폴링 주기에 얽매면
       * 순화가 붙는 속도가 그 주기에 묶이고, AI 가 20초나 걸리는 동안 대화가 이미 지나간다.
       */
      remaining: number;
    }
  | { ok: false; message: string };

/** 한 말의 현재 상태를 화면 값으로 옮긴다. */
function toCushionView(row: {
  status: string;
  text: string | null;
  source: string | null;
  reason: string | null;
  retryAfter: Date | null;
}): CushionView {
  if (row.text && (row.status === "PURIFIED" || row.status === "FALLBACK")) {
    return {
      status: row.status,
      text: row.text,
      kind: row.source === "mask" ? "mask" : "ai",
      reason: null,
      retryAfter: null,
    };
  }
  // 실패 상태는 글 없이 상태만 남는다 — 화면이 그 말은 **원문**으로 그린다.
  // 모르는 status(옛 데이터·손으로 넣은 값)는 실패로 본다. 모르는 상태를 "순화됨" 으로
  // 그리는 일은 없어야 한다.
  const status: "PENDING" | "REJECTED" | "FAILED" =
    row.status === "PENDING" || row.status === "REJECTED" ? row.status : "FAILED";
  return {
    status,
    text: null,
    kind: null,
    reason: row.reason,
    retryAfter: row.retryAfter ? row.retryAfter.toISOString() : null,
  };
}

/** 원문 지문. 캐시가 "같은 입력으로 만든 것인가" 를 판정하는 기준이다. */
function hashSource(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * 이 방에 도착한 남의 말을 순화해 **읽을 형태**로 만들어 둔다.
 *
 * ## 왜 이렇게 길다 — 실패를 저장하기 때문
 *
 * 예전에는 성공한 결과만 저장했다. 그래서 **거절된 말도 "아직 없는 말"** 로 남아 3초마다
 * 다시 후보가 되었고, 새로고침하면 브라우저의 "시도함" 기록까지 리셋되어 하루 60회가
 * 몇 분 만에 Gone 이 되었다. 이제 흐름이 이렇게다.
 *
 * 1. **지금 다시 부를 수 있는지** 저���된 상태에 물어본다(`canRetry`). 성공·백오프·시도 횟수·
 *    프롬프트/모델 버전을 본다.
 * 2. **선점한다.** `PENDING` 행을 먼저 만들고 `claimToken` 을 심는다. **토큰이 내 것인
 *    항목만 모델을 부른다** — 두 탭이 동시에 열려도 한 번만 부른다.
 * 3. **묶어서 한 번 부른다**(최대 10개, AI 한도 1회).
 * 4. **항목별로 판정한다**(`judgeAll`). 개수·순서가 아니라 `id` 로 맞춘다.
 * 5. **거절·실패한 항목은 규칙 가림으로 이어받는다**(`FALLBACK`). AI 결과인 척 하지 않는다.
 * 6. **전부 저장한다** — 성공도 실패도. 다음 화면은 이 표를 보고 더 부를지 말지 정한다.
 *
 * 실패하면 그 말은 **원문이 보인다**. 가릴 수 있는 표현이면 규칙이 가린본을 보여 준다.
 */
export async function softenThreadMessages(threadId: string): Promise<SoftenThreadResult> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);
  const at = Date.now();
  const model = activeModelId();

  /**
   * **무엇을 순화할지는 서버가 정한다.** 화면은 "이 방을 봐줘" 라고만 한다.
   *
   * 예전에는 화면이 id 를 골라 보내고 서버는 그 id 를 믿었다. 그래서 세 가지가 뒤틀렸다 —
   * 화면이 아직 못 받은 말을 빠뜨리고(그 말은 원문으로 남는다), 화면이 이미 아는 말을
   * 중복으로 보내고(선점이 막긴 하지만 왕복이 늘어난다), 화면의 판단이 서버 규칙과 어긋나면
   * **조용히 아무 일도 안 일어난다.** 이제 화면이 모르는 새 말도 서버가 직접 찾는다.
   *
   * 대상: 이 방의 **남의 말** 중 글자가 있고, 아직 순화본이 없거나 다시 시도할 수 있는 것.
   * 오래된 것부터 — 읽는 사람이 위에서부터 보며 순화가 붙는 것을 보기 때문이다.
   */
  const rows = await db.message.findMany({
    where: { teamId: me.teamId, threadKey, authorId: { not: me.id } },
    select: { id: true, text: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const texts = rows.filter((row) => isPurifiableText(row.text));
  if (texts.length === 0) return { ok: true, cushions: {}, called: 0, remaining: 0 };

  // 저장된 상태를 먼저 읽는다 — "이 말은 이미 어떻게 됐나" 가 이번 호출의 전부다.
  const existing = await db.messageCushion.findMany({
    where: { viewerId: me.id, messageId: { in: texts.map((row) => row.id) } },
  });
  const stored = new Map(existing.map((row) => [row.messageId, row]));

  const toneRow = await db.readCushion.findUnique({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    select: { tone: true },
  });
  const tone = toneOf({ tone: toneRow?.tone ?? null });

  // 1) 지금 부를 수 있는 것만 고른다.
  const claimable = texts.filter((row) =>
    canRetry(
      stored.get(row.id)
        ? {
            status: stored.get(row.id)!.status as CushionStatus,
            reason: stored.get(row.id)!.reason as CushionReason | null,
            attemptCount: stored.get(row.id)!.attemptCount,
            retryAfter: stored.get(row.id)!.retryAfter?.toISOString() ?? null,
            model: stored.get(row.id)!.model,
            promptVersion: stored.get(row.id)!.promptVersion,
            createdAt: stored.get(row.id)!.createdAt.toISOString(),
          }
        : null,
      { model, promptVersion: PROMPT_VERSION, at },
    ),
  );

  // 2) 선점한다. **내가 Token 을 심은 행만 내 것** — 남의 선점을 덮어쓰지 않는다.
  const claimToken = randomUUID();
  const claimIds = claimable.slice(0, PURIFY_BATCH_LIMIT).map((row) => row.id);
  const sourceOf = new Map(texts.map((row) => [row.id, row.text]));
  if (claimIds.length > 0) {
    const now = new Date(at);
    await db.messageCushion.createMany({
      data: claimIds.map((id) => {
        const source = sourceOf.get(id) ?? "";
        return {
          messageId: id,
          viewerId: me.id,
          status: "PENDING",
          sourceHash: hashSource(source),
          tone,
          model,
          promptVersion: PROMPT_VERSION,
          validatorVersion: VALIDATOR_VERSION,
          claimToken,
          retryAfter: new Date(at + CLAIM_TTL_MS),
        };
      }),
      skipDuplicates: true,
    });
  }

  const afterClaim = await db.messageCushion.findMany({
    where: { viewerId: me.id, messageId: { in: texts.map((row) => row.id) } },
  });
  const mine = afterClaim.filter((row) => row.claimToken === claimToken).map((row) => row.messageId);
  const textOf = new Map(texts.map((row) => [row.id, row.text.trim()]));
  /**
   * 아직 손대지 않은 것이 남았나 — 화면이 **곧바로** 다음 묶음을 부를 수 있게 알려 준다.
   * 화면이 이 수 대신 3초를 기다리면 순화가 붙는 속도가 폴링 주기에 묶인다.
   */
  const remaining = claimable.length - mine.length;

  const cushions: Record<string, CushionView> = {};
  for (const row of afterClaim) cushions[row.messageId] = toCushionView(row);

  if (mine.length === 0) return { ok: true, cushions, called: 0, remaining };

  // 3) 묶어서 한 번 부른다.
  const items = packPurifyItems(mine.map((id) => ({ id, text: textOf.get(id) ?? "" })));
  const modelId = model;
  const attempt = claimable.find((row) => mine.includes(row.id));
  const priorAttempts = attempt ? (stored.get(attempt.id)?.attemptCount ?? 0) : 0;

  const result = await runTool("read-cushion", () => softenIncoming(items, tone));

  /** 이 항목의 결과를 저장한다. 실패도 저장한다 — 안 하면 다시 부른다. */
  const save = async (
    id: string,
    view: CushionView,
    extra: { reason?: CushionReason | null; text?: string; source?: "ai" | "mask" } = {},
  ) => {
    cushions[id] = view;
    await db.messageCushion.update({
      where: { messageId_viewerId: { messageId: id, viewerId: me.id } },
      data: {
        status: view.status,
        reason: extra.reason ?? null,
        text: extra.text ?? null,
        source: extra.source ?? null,
        model: modelId,
        promptVersion: PROMPT_VERSION,
        validatorVersion: VALIDATOR_VERSION,
        attemptCount: priorAttempts + 1,
        claimToken: null,
        // 실패는 **같은 설정으로는 다시 부르지 않게** 닫아 둔다. `canRetry` 가 버전을 보고
        // 열어 준다 — 프롬프트를 고쳤거나 모델을 바꿨을 때만.
        retryAfter: view.status === "PENDING" ? null : new Date(at + FAILURE_BACKOFF_MS),
      },
    });
  };

  if (!result.ok) {
    // 한도·타임아웃처럼 **묶음 전체가 실패**했다. 항목별로 되돌린다.
    const reason: CushionReason = result.message.includes("한도") || result.message.includes("횟수")
      ? CUSHION_REASON.RATE_LIMITED
      : CUSHION_REASON.MODEL_REFUSAL;
    for (const item of items) {
      const masked = maskRiskyParts(item.text);
      if (masked.masked > 0) {
        await save(item.id, {
          status: "FALLBACK",
          text: masked.text,
          kind: "mask",
          reason: null,
          retryAfter: null,
        }, { reason, text: masked.text, source: "mask" });
        continue;
      }
      await save(item.id, { status: "FAILED", text: null, kind: null, reason, retryAfter: null }, { reason });
    }
    return { ok: true, cushions, called: 1, remaining: remaining - items.length };
  }

  // 4) 항목별 판정.
  const refused = isRefusal(result.value.raw);
  const parsed = parsePurifyResponse(result.value.raw);

  for (const item of items) {
    if (refused) {
      const masked = maskRiskyParts(item.text);
      if (masked.masked > 0) {
        await save(item.id, {
          status: "FALLBACK",
          text: masked.text,
          kind: "mask",
          reason: null,
          retryAfter: null,
        }, { reason: CUSHION_REASON.MODEL_REFUSAL, text: masked.text, source: "mask" });
        continue;
      }
      await save(item.id, {
        status: "FAILED",
        text: null,
        kind: null,
        reason: CUSHION_REASON.MODEL_REFUSAL,
        retryAfter: null,
      }, { reason: CUSHION_REASON.MODEL_REFUSAL });
      continue;
    }

    const verdict = judgeOne(item, parsed.items.get(item.id));
    if (verdict.status === "PURIFIED" && verdict.text) {
      await save(item.id, {
        status: "PURIFIED",
        text: verdict.text,
        kind: "ai",
        reason: null,
        retryAfter: null,
      }, { text: verdict.text, source: "ai" });
      continue;
    }

    // AI 가 실패한 항목 — **가릴 수 있으면 가린다.** 가장 순화해야 할 말이 원문으로
    // 남는 것을 막는 것이 이 단계의 목적이다.
    const reason = verdict.reason ?? CUSHION_REASON.EMPTY_RESPONSE;
    const masked = maskRiskyParts(item.text);
    if (masked.masked > 0) {
      await save(item.id, {
        status: "FALLBACK",
        text: masked.text,
        kind: "mask",
        reason: null,
        retryAfter: null,
      }, { reason, text: masked.text, source: "mask" });
      continue;
    }
    await save(item.id, {
      status: "REJECTED",
      text: null,
      kind: null,
      reason,
      retryAfter: null,
    }, { reason });
  }

  return { ok: true, cushions, called: 1, remaining: Math.max(0, remaining - items.length) };
}

