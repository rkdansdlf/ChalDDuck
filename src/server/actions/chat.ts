"use server";

import { revalidatePath } from "next/cache";
import { CUSHION_DEFAULT_MODE } from "@/data/catalog";
import { purifyPolicyHash } from "@/server/ai/purify-policy";
import type { CushionLevelKey } from "@/lib/types";
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
  PURIFY_CONTEXT_MESSAGES,
  VALIDATOR_VERSION,
  canRetry,
  isCushionTone,
  isPurifiableText,
  isRefusal,
  judgeOne,
  levelOf,
  maskRiskyParts,
  packPurifyItems,
  parsePurifyResponse,
  remainingPurify,
  toneOf,
  type CushionReason,
  type CushionStatus,
  type ReadCushionSetting,
} from "@/lib/read-cushion";
import type { ChatMessage, DmThread } from "@/lib/types";
import { db } from "@/server/db";
import { markLastCallRefused } from "@/server/ai/call-context";
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

/**
 * AI 리서치 결과를 팀 단톡방에 공유한다.
 *
 * 팀원들에게 자료 카드 형태로 핵심 내용, 출처, 원문 링크를 전달한다.
 */
export async function shareResearchToChat(input: {
  title: string;
  source: string;
  snippet: string;
  url?: string | null;
  year?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireSessionMember();

    const lines = [
      `[자료 추천] ${input.title.trim()}`,
      `• 출처: ${input.source.trim()}${input.year ? ` (${input.year.trim()})` : ""}`,
    ];
    if (input.snippet.trim()) {
      lines.push(`• 요약: ${input.snippet.trim()}`);
    }
    if (input.url?.trim()) {
      lines.push(`• 원문 링크: ${input.url.trim()}`);
    }

    const body = lines.join("\n").slice(0, MAX_MESSAGE);

    await db.message.create({
      data: {
        teamId: me.teamId,
        threadKey: "team",
        authorId: me.id,
        text: body,
        whenLabel: nowLabel(),
      },
    });

    revalidatePath("/chat", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "단톡방 공유에 실패했습니다.",
    };
  }
}

/**
 * 26 발표 지원 — 예상 질문 목록을 팀 단톡방에 공유한다.
 *
 * 발표자 혼자 질의응답을 떠안지 않고 팀원들과 함께 Q&A를 준비하고 역할 분담을 할 수 있도록
 * 예상 질문 목록을 단톡방 카드 형태로 전송한다.
 */
export async function shareQuestionsToChat(input: {
  modeName?: string;
  questions: Array<{ question: string; intent?: string; category?: string }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireSessionMember();

    if (!input.questions || input.questions.length === 0) {
      return { ok: false, error: "공유할 질문이 없습니다." };
    }

    const categoryNames: Record<string, string> = {
      data: "데이터 근거",
      method: "방법론",
      practical: "실효성·한계",
      general: "일반",
    };

    const lines = [
      `[발표 대비] 예상 질문 목록${input.modeName ? ` (${input.modeName})` : ""}`,
      "팀원들과 함께 발표 질의응답을 준비해 보세요:",
    ];

    input.questions.forEach((q, idx) => {
      const catLabel = q.category && categoryNames[q.category] ? `[${categoryNames[q.category]}] ` : "";
      const intentNote = q.intent ? ` — ${q.intent}` : "";
      lines.push(`${idx + 1}. ${catLabel}${q.question}${intentNote}`);
    });

    const body = lines.join("\n").slice(0, MAX_MESSAGE);

    await db.message.create({
      data: {
        teamId: me.teamId,
        threadKey: "team",
        authorId: me.id,
        text: body,
        whenLabel: nowLabel(),
      },
    });

    revalidatePath("/chat", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "단톡방 공유에 실패했습니다.",
    };
  }
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

/* ── 읽기 도움(19 · 31) ────────────────────────────────────── */

/**
 * 이 방의 말을 **어떻게 읽는지** 고른다 — 끄기·강도·말투.
 *
 * ## 왜 `enabled` 와 `mode` 가 둘인가
 *
 * 둘을 한 칸(`mode: "OFF"`)으로 합치면 **끄기 전에 고른 단계를 잃는다.** 다시 켰을 때
 * 어디까지 세게 읽을지 몰라 처음부터 골라야 한다. 끄기는 `enabled=false` 이고 `mode` 는
 * 그대로 남는다 — 대화를 잠깐 원문으로 읽다가 **내 자리로 돌아오는** 길이다.
 *
 * 말투는 같은 단계 안에서 고른다. 단계가 "얼마까지" 면 말투는 "어떤 톤으로" 다.
 * 둘을 한 칸에 섞으면 9개를 고르는 셈이 되고, 사람은 그중 하나만 본다.
 */
export async function setReadCushion(
  threadId: string,
  setting: { enabled?: boolean; mode?: string; tone?: string },
): Promise<{ ok: true; setting: ReadCushionSetting } | { ok: false; message: string }> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  const before = await db.readCushion.findUnique({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    select: { enabled: true, mode: true, tone: true },
  });
  // 모르는 값은 그대로 넣지 않는다 — 프롬프트가 못 찾는 강도는 "보통 없는" 읽기 도움이 되고,
  // 검사는 통과 기준이 없다. 없는 것으로 보고 지금 쓰는 기본을 쓴다.
  const mode = setting.mode === "LIGHT" || setting.mode === "STRONG" ? setting.mode : CUSHION_DEFAULT_MODE;
  const enabled = setting.enabled !== false;
  const tone = isCushionTone(setting.tone) ? setting.tone : (before?.tone ?? toneOf({ tone: null }));

  /**
   * **기준이 바뀌면 예전 다듬은 말을 지우지 않는다 — 지우는 것이 오히려 버그가 된다.**
   *
   * 예전에는 한 말에 사람당 한 줄이라 새 조건으로 덮어쓸 수 없어서 지웠다. 그래서 사용자가
   * "보통" → "강하게" → **"보통"** 으로 되돌리면 AI 를 다시 불렀다. 결과는 그 강도·말투의
   * **결정적 함수**이므로 이미 있다.
   *
   * 지금은 다듬은 말이 (말, 설정지문) 로 저장되므로 기준을 바꾸면 **읽는 지문만 달라진다.**
   * 옛 지문의 행은 그 지문으로 읽는 사람(옛 teammate, 나중에 돌아온 나)을 위해 남겨 둔다.
   *
   * 화면이 옛 말을 보는 일은 없다 — 조회가 **현재 지문으로**만 일어나기 때문이다. 설정을
   * 바꾸고 아직 읽기 도움이 안 붙은 말은 그 지문에 없으므로 `PENDING` 으로 보이고, 다음 부름에서
   * 새 지문으로 만들어진다.
   *
   * 남는 것은 AI 한 번어치의 저장 공간뿐이고, 대신 되돌리기·부르기·다시 켜기가 **0회**다.
   * 오래된 설정의 행을 없애는 일은 읽기 경로가 아니라 정리 작업이다(cron).
   */
  const saved = await db.readCushion.upsert({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    update: { enabled, mode, tone },
    create: { memberId: me.id, threadKey, enabled, mode, tone },
  });

  return {
    ok: true,
    setting: {
      enabled: saved.enabled,
      mode: levelOf({ enabled: saved.enabled, mode: saved.mode as CushionLevelKey, tone: saved.tone }),
      tone: saved.tone,
    },
  };
}

/** 읽기 도움 상태 하나 — 화면이 그대로 그리는 값. */
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
       * 읽기 도움이 붙는 속도가 그 주기에 묶이고, AI 가 20초나 걸리는 동안 대화가 이미 지나간다.
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
  // 모르는 status(옛 데이터·손으로 넣은 값)는 실패로 본다. 모르는 상태를 "읽기 도움됨"으로
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
 * 이 방에 도착한 남의 말을 읽을 수 있는 형태로 만들어 둔다.
 *
 * ## 왜 이렇게 길다 — 실패를 저장하기 때문
 *
 * 예전에는 성공한 결과만 저장했다. 그래서 **거절된 말도 "아직 없는 말"** 로 남아 3초마다
 * 다시 후보가 되었고, 새로고침하면 브라우저의 "시도함" 기록까지 리셋되어 하루 60회가
 * 몇 분 만에 Gone 이 되었다. 이제 흐름이 이렇게다.
 *
 * 1. **지금 다시 부를 수 있는지** 저장된 상태에 물어본다(`canRetry`). 성공·백오프·시도 횟수·
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
   * **무엇을 다듬을지는 서버가 정한다.** 화면은 "이 방을 봐줘" 라고만 한다.
   *
   * 예전에는 화면이 id 를 골라 보내고 서버는 그 id 를 믿었다. 그래서 세 가지가 뒤틀렸다 —
   * 화면이 아직 못 받은 말을 빠뜨리고(그 말은 원문으로 남는다), 화면이 이미 아는 말을
   * 중복으로 보내고(선점이 막긴 하지만 왕복이 늘어난다), 화면의 판단이 서버 규칙과 어긋나면
   * **조용히 아무 일도 안 일어난다.** 이제 화면이 모르는 새 말도 서버가 직접 찾는다.
   *
   * 대상: 이 방의 **남의 말** 중 글자가 있고, 아직 다듬은 말이 없거나 다시 시도할 수 있는 것.
   * 오래된 것부터 — 읽는 사람이 위에서부터 보며 읽기 도움이 붙는 것을 보기 때문이다.
   */
  const rows = await db.message.findMany({
    where: { teamId: me.teamId, threadKey },
    select: { id: true, text: true, authorId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  /**
   * **앞 문맥은 방의 모든 말에서 쓴다 — 내 말까지.**
   *
   * "누가 누구에게 말했는지" 가 읽기 도움의 질을 결정한다. 앞을 **남의 말만** 으로 자르면
   * 내 말("나도 내일 안에 낼게")이 빠지고, 그 결과 **약속이 사라진 다듬은 말**이 나온다 —
   * 가장 나쁜 실패다(요구·마감을 지키지 못한다).
   */
  const contextOf = (index: number) =>
    rows
      .slice(Math.max(0, index - PURIFY_CONTEXT_MESSAGES), index)
      .map((row) => ({ text: row.text.trim() }))
      .filter((row) => row.text.length > 0);

  const texts = rows
    .map((row, index) => ({ ...row, before: contextOf(index) }))
    .filter((row) => row.authorId !== me.id && isPurifiableText(row.text));
  if (texts.length === 0) return { ok: true, cushions: {}, called: 0, remaining: 0 };

  const toneRow = await db.readCushion.findUnique({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    select: { enabled: true, mode: true, tone: true },
  });
  /**
   * **꺼져 있으면 모델을 부르지 않는다.**
   *
   * 끄는 뜻은 "이 방의 말은 원문으로 읽겠다" 이지 "AI 를 쓰되 조용히" 가 아니다. 그래서 후보를
   * 아예 만들지 않는다 — 사용하지 않을 AI 를 부르는 것이 이 기능을 가장 이상하게 만드는 방법이다.
   */
  if (toneRow && toneRow.enabled === false) {
    return { ok: true, cushions: {}, called: 0, remaining: 0 };
  }
  const setting: ReadCushionSetting = {
    enabled: true,
    mode: levelOf({ enabled: true, mode: (toneRow?.mode ?? CUSHION_DEFAULT_MODE) as CushionLevelKey, tone: toneRow?.tone ?? null }),
    tone: toneOf({ tone: toneRow?.tone ?? null }),
  };
  const level = levelOf(setting);
  const tone = toneOf(setting);

  /**
   * **설정 지문: 읽기 도움 결과를 만드는 조건을 한 문자열로.**
   *
   * 열쇠가 (말, 읽는 사람)이 아니라 (말, 이 지문)이다. **사람이 열쇠에 없다** — 같은 말이라
   * 읽는 조건(강도·말투·프롬프트·모델·검사기)이 같으면 결과는 같고, 팀원 5명이 방에서 같이
   * 읽어도 **모델을 한 번만** 부른다.
   *
   * 지문에 **팀 ID 를 넣지 않는다.** 동명이 다른 팀이 같은 이야기를 하고 있어도 읽기 도움 결과는
   * 같다(원문이 같으면). 팀을 섞으면 사람이 보는 것보다 더 많이 공유할 수 있다.
   */
  const policyHash = purifyPolicyHash({ level, tone, model, promptVersion: PROMPT_VERSION, validatorVersion: VALIDATOR_VERSION });

  // 저장된 상태를 먼저 읽는다 — "이 말은 이 설정으로 이미 어떻게 됐나" 가 이번 호출의 전부다.
  const existing = await db.messagePurification.findMany({
    where: { messageId: { in: texts.map((row) => row.id) }, policyHash },
  });
  const stored = new Map(existing.map((row) => [row.messageId, row]));

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
    await db.messagePurification.createMany({
      data: claimIds.map((id) => {
        const source = sourceOf.get(id) ?? "";
        return {
          messageId: id,
          policyHash,
          level,
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

  const afterClaim = await db.messagePurification.findMany({
    where: { messageId: { in: texts.map((row) => row.id) }, policyHash },
  });
  const mine = afterClaim.filter((row) => row.claimToken === claimToken).map((row) => row.messageId);
  const textOf = new Map(texts.map((row) => [row.id, row.text.trim()]));

  const cushions: Record<string, CushionView> = {};
  for (const row of afterClaim) cushions[row.messageId] = toCushionView(row);

  /**
   * 내가 선점을 못 가져간 말은 **남은 일로 센다.**
   *
   * 같은 사람이 두 탭에서 같은 방을 보고 있으면 그럴 수 있고, 그 말은 이 요청이 못 가져간 것이지
   * 사라진 것이 아니다. `canRetry` 이 아직 유효한 `PENDING` 을 걸러내므로, 상대가 끝난 다음
   * 부름에서 이 수는 0 이 되고 그때까지 화면은 AI 를 추가로 쓰지 않는다.
   */
  const uncontested = remainingPurify(claimable.length, mine.length);

  if (mine.length === 0) return { ok: true, cushions, called: 0, remaining: uncontested };

  // 3) 묶어서 한 번 부른다.
  const beforeOf = new Map(texts.map((row) => [row.id, row.before]));
  const items = packPurifyItems(
    mine.map((id) => ({ id, text: textOf.get(id) ?? "", before: beforeOf.get(id) ?? [] })),
  );
  const modelId = model;
  const attempt = claimable.find((row) => mine.includes(row.id));
  const priorAttempts = attempt ? (stored.get(attempt.id)?.attemptCount ?? 0) : 0;

  /**
   * 이 묶음을 보낸 뒤 **앞으로 더 손대야 할 말**이 몇 개 남았나.
   *
   * `claimable` 에서 **이번에 처리한 것만** 뺀다. `mine` 을 한 번 더 빼면(내 이전 버그) 이 값이
   * 음수가 되고, 화면은 `remaining !== 0` 이니 계속 묶음을 부른다 — AI 를 쓸 이유가 없는
   * 상태로. 화면이 멈추는 기준이 이 값이라 **음수가 나면 안 된다.**
   */
  const remaining = remainingPurify(claimable.length, items.length);


  /**
   * 이 묶음의 **호출 시간**을 잰다.
   *
   * 지연을 재지 않으면 "느려서 안 쓰는 것" 과 "못 해서 안 쓰는 것" 을 구분할 수 없다 —
   * 둘 다 화면에서는 "안 바뀌는 말" 처럼 보인다. 모델을 바꿀지 판단할 때 이 숫자가
   * 절반이다. 묶음의 모든 행이 같은 값을 갖는다(호출이 하나였으므로).
   */
  const calledAt = Date.now();
  const result = await runTool("read-cushion", () => softenIncoming(items, tone, level));
  const latencyMs = result.ok ? Date.now() - calledAt : null;

  /** 이 항목의 결과를 저장한다. 실패도 저장한다 — 안 하면 다시 부른다. */
  const save = async (
    id: string,
    view: CushionView,
    extra: { reason?: CushionReason | null; text?: string; source?: "ai" | "mask" } = {},
  ) => {
    cushions[id] = view;
    await db.messagePurification.update({
      where: { messageId_policyHash: { messageId: id, policyHash } },
      data: {
        status: view.status,
        reason: extra.reason ?? null,
        text: extra.text ?? null,
        source: extra.source ?? null,
        model: modelId,
        promptVersion: PROMPT_VERSION,
        validatorVersion: VALIDATOR_VERSION,
        attemptCount: priorAttempts + 1,
        latencyMs,
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
      const masked = maskRiskyParts(item.text, level);
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
    return { ok: true, cushions, called: 1, remaining };
  }

  // 4) 항목별 판정.
  const refused = isRefusal(result.value.raw);
  const parsed = parsePurifyResponse(result.value.raw);

  /**
   * 계측에 **거절**이라고 남긴다.
   *
   * 모델 층은 이 호출이 거절인지 몰랐다 — 답이 왔으므로 성공으로 적었다. 그런데 이 도구는
   * 일을 하지 못했다. 계측이 `ok` 로 남으면 "느린 것"과 "거절당하는 것"이 같은 0 으로
   * 보이고, **모델을 바꿔야 할 문제를 "다시 눌러라" 고 안내하게 된다.** (거부는 다시 눌러도
   * 같은 결과가 나온다 — 실측 16/26.)
   */
  if (refused) markLastCallRefused();

  for (const item of items) {
    if (refused) {
      const masked = maskRiskyParts(item.text, level);
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

    const verdict = judgeOne(item, parsed.items.get(item.id), level);
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

    // AI 가 실패한 항목 — **가릴 수 있으면 가린다.** 가장 다듬어야 할 말이 원문으로
    // 남는 것을 막는 것이 이 단계의 목적이다.
    const reason = verdict.reason ?? CUSHION_REASON.EMPTY_RESPONSE;
    const masked = maskRiskyParts(item.text, level);
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

  return { ok: true, cushions, called: 1, remaining };
}

