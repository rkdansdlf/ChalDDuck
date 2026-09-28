/**
 * 읽기 순화(19 화면 · 31 화면)의 **계약**.
 *
 * 이 파일 하나가 "무엇을 순화하고, 무엇을 버리고, 실패하면 무엇을 보여 주는가" 를 정한다.
 * 화면과 서버가 **같은 함수**를 쓰는 이유가 그것이다 — 두 곳이 따로 판단하면
 * "화면은 다 순화됐다고 믿는데 서버는 일부만 시킨다" 는 상태가 조용히 생기고, 그건
 * 타입 검사로 절대 못 잡는다.
 *
 * ## 이 계약이 푸는 문제
 *
 * 예전 구현(배열 순서 기반, 결과만 저장)은 **실패를 저장하지 않았다.** 그래서
 * - 거절된 말이 "아직 없는 말"로 남아 **3초마다** 다시 AI 후보가 되고,
 * - 새로고침하면 브라우저 메모리의 "시도함" 기록이 리셋되어 **하루 60회 한도가 몇 분 만에
 *   다 Gone** 이 되었으며,
 * - 응답에서 항목 하나가 빠지면 **전체 묶음을 버려야** 해서, 10개 중 8개만 멀쩡해도
 *   8개를 다 버렸다.
 *
 * 지금은 **항목별 id 계약**(`[{id,text}] → [{id,text}]`)이고, **실패도 저장**하며,
 * AI 가 거절하면 **규칙으로 위험 표현만 가린**(`FALLBACK`) 결과를 보여 준다.
 *
 * 이 파일은 DOM 도 DB 도 없다 — `scripts/smoke.mts` 가 그대로 불러 규칙을 확인한다.
 */

import { CUSHION_TONES } from "@/data/catalog";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import type { ChatMessage } from "@/lib/types";

/* ── 상태와 이유 ─────────────────────────────────────────────── */

/**
 * 이 말(읽는 사람, 메시지) 하나가 지금 어디까지 갔는가.
 *
 * `PURIFIED` / `FALLBACK` 만 **끝**이고, 나머지는 같은 설정으로는 다시 시도하지 않는다.
 */
export const CUSHION_STATUS = ["PENDING", "PURIFIED", "FALLBACK", "REJECTED", "FAILED"] as const;
export type CushionStatus = (typeof CUSHION_STATUS)[number];

/** 끝난 상태 — 다시 부르지 않는다. 화면은 이때 순화본(또는 가림본)을 그린다. */
export function isCushionDone(status: CushionStatus): boolean {
  return status === "PURIFIED" || status === "FALLBACK";
}

/**
 * 실패 taxonomy.
 *
 * **`reason` 은 화면에 보여 주지 않는다.** 운영 지표와 재생성 판단에만 쓴다 — 그런데도
 * 반드시 남긴다. "모델이 문제인가 / 프롬프트인가 / 검사가 과한가" 를 구분하려면
 * 숫자로 남겨야 하고, 그 숫자가 없으면 "안 된다" 는 말만 반복하게 된다.
 */
export const CUSHION_REASON = {
  /** 모델이 쓰기를 거절했다(안전 필터 등). */
  MODEL_REFUSAL: "MODEL_REFUSAL",
  /** 응답이 비었다. */
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  /** JSON 이 아니어서 항목을 못 꺼냈다. */
  PARSE_FAILED: "PARSE_FAILED",
  /** 응답에 요청하지 않은 id 가 섞여 있다. */
  UNKNOWN_ID: "UNKNOWN_ID",
  /** 같은 id 가 두 번 나왔다. */
  DUPLICATE_ID: "DUPLICATE_ID",
  /** 구조는 맞는데 비어 있다. */
  EMPTY_OUTPUT: "EMPTY_OUTPUT",
  /** 욕·비꼼·조롱이 그대로 남아 있다. **가장 흔하다.** */
  TOXICITY_REMAINED: "TOXICITY_REMAINED",
  /** 원문의 핵심 정보(숫자·시각·이름·업무 대상)가 사라졌다. */
  INFO_LOST: "INFO_LOST",
  /** 원문보다 지나치게 길다. 순화가 아니라 지어내기다. */
  TOO_LONG: "TOO_LONG",
  /** 오늘 쓸 수 있는 AI 횟수가 다났다. */
  RATE_LIMITED: "RATE_LIMITED",
  /** AI 키가 없다. */
  NO_MODEL: "NO_MODEL",
} as const;
export type CushionReason = (typeof CUSHION_REASON)[keyof typeof CUSHION_REASON];

/** 모델이 고를 때 그대로 돌려주는 문자열을 여기서 알아본다. */
const REFUSAL_MARKS =
  /^\s*(user safety|unsafe|safety categories|i can'?t|i cannot|i'?m sorry|sorry,|as an ai|抱歉|对不起|无法|无法协助)/i;

/* ── 버전과 재시도 정책 ──────────────────────────────────────── */

/**
 * 프롬프트 버전.
 *
 * **실패 캐시를 여는 열쇠**다. 같은 원문·같은 모델이라도 프롬프트를 고쳤다면 예전 실패는
 * 낡은 정보가 된다 — `PARSE_FAILED` 나 `TOXICITY_REMAINED` 가 프롬프트 때문에 났을 수 있기
 * 때문이다. 버전을 올리면 실패가 자동으로 다시 열린다(몇 달 뒤 재생성이 되는 근거).
 */
export const PROMPT_VERSION = "p1";

/** 검사 버전. 규칙을 손보면 올린다(위와 같은 이유로 실패가 다시 열린다). */
export const VALIDATOR_VERSION = "v1";

/** 같은 설정으로는 몇 번까지 시도할지. 이 값을 넘으면 **포기 상태**로 고정한다. */
export const MAX_ATTEMPTS = 2;

/**
 * 실패 뒤 다시 시도하기까지의 시간.
 *
 * 거절은 "지금 이 말을 다시 넣어도 같은 결과" 다 — **시간**이 아니라 **버전**으로 판단해야
 * 한다. 이 값은 그 사이의 안전망이고, 시간이 지나면 한 번만 더 시도한다.
 */
export const FAILURE_BACKOFF_MS = 30 * 60 * 1000;

/**
 * `PENDING` 선점의 유효 시간.
 *
 * 이 시간 안에 아무도 갱신하지 않은 `PENDING` 은 **사라진 요청**이다(브라우저를 닫았거나
 * 서버가 죽었거나). 시간이 지나면 다음 사람이 선점을 가져갈 수 있다 — 안 그러면 그 말은
 * 영영 "처리 중"으로 남아 순화본을 영영 못 받는다.
 */
export const CLAIM_TTL_MS = 90 * 1000;

/** 한 번에 묶어서 부르는 말의 수. */
export const PURIFY_BATCH_LIMIT = 10;

type StoredRow = {
  status: CushionStatus;
  reason: CushionReason | null;
  attemptCount: number;
  retryAfter: string | null;
  model: string | null;
  promptVersion: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

/**
 * 이 말을 **지금 다시 AI 로 부를 수 있는가.**
 *
 * | 상태 | 판정 |
 * |---|---|
 * | `PURIFIED` / `FALLBACK` | **아니요.** 끝났습니다. |
 * | `PENDING` | 선점 유효 시간이 지나기 전까지는 아니요(두 탭 경합). |
 * | `REJECTED` / `FAILED` | 같은 설정이면 아니요. **모델이나 프롬프트가 바뀌었거나** 백오프가 지났고 시도 횟수가 남았을 때만 예. |
 *
 * 이 한 함수가 "3초마다 다시 부르는" 문제를 막는 곳이다. 화면은 저장된 상태를 보고 이
 * 판정을 신뢰하고, 다시 부를지 말지만 이 함수에 물어본다.
 */
export function canRetry(
  row: StoredRow | null,
  now: { model: string; promptVersion: string; at: number },
): boolean {
  if (!row) return true;
  if (isCushionDone(row.status)) return false;

  // 누군가 부르는 중인가 — 선점 유효 시간 안에서는 건드리지 않는다.
  if (row.status === "PENDING") {
    const at = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    return now.at - at > CLAIM_TTL_MS;
  }

  if (row.attemptCount >= MAX_ATTEMPTS) return false;

  // 설정이 바뀌었으면 예전 실패는 낡았다 — 지금 다시 시도할 이유가 생긴다.
  const changed = row.model !== now.model || row.promptVersion !== now.promptVersion;
  if (changed) return true;

  return row.retryAfter !== null && new Date(row.retryAfter).getTime() <= now.at;
}

/* ── 순화 대상 판정 ─────────────────────────────────────────── */

/** 순화가 고를 수 있는 말의 최소 길이. 한 글짜리는 순화할 대상이 아니다. */
const MIN_TEXT_LENGTH = 2;

/**
 * 이 글에 순화본을 만들 수 있는가.
 *
 * 서버도 **같은 규칙**으로 걸러야 한다 — 화면이 골라 준 id 를 그대로 믿으면 순화 대상이 아닌
 * 말(내 말, 파일만 보낸 말)에 대한 AI 호출이 생기고, 그 결과가 저장이 된다.
 */
export function isPurifiableText(text: string): boolean {
  return text.trim().length >= MIN_TEXT_LENGTH;
}

/** 이 말을 순화해도 되는가. */
export function canPurify(message: ChatMessage): boolean {
  if (message.isMine) return false;
  if (message.status !== "sent") return false;
  return isPurifiableText(message.text);
}

/* ── AI 입출력 계약 (id 기반) ──────────────────────────────── */

export type PurifyItem = { id: string; text: string };

/** AI 가 돌려주는 한 항목. */
export type PurifyResult = { id: string; text: string };

/**
 * 모델에게 **넘기는 형태** — JSON 으로 준다.
 *
 * 왜 글 배열이 아니라 `{ task, items[] }` 인가 — 두 가지 다 막으려는 것이다.
 * 1. **응답 정렬**: 항목마다 `id` 가 있으면 10개 중 8개만 성공해도 나머지 2개를 잃지 않는다.
 * 2. **입력 경계**: 본문을 `{"task":…,"items":[{"id":…,"text":…}]}` **데이터**로 준다.
 *    글로 붙이면 "이전 지시를 무시해" 같은 문장이 **지시로 읽힐 수 있다.**
 */
export function buildPurifyRequest(items: PurifyItem[]): string {
  return JSON.stringify({
    task: "rewrite_for_reader_comfort",
    items: items.map((item) => ({ id: item.id, text: item.text })),
  });
}

/**
 * 묶음을 상한에 맞춰 **줄인다** — 자르지 않는다.
 *
 * `model.ts` 의 `clampInput` 이 조용히 자르면 잘린 말은 순화되지 않은 채 남아, 화면에는
 * "다 순화됐다" 고 보이지만 실제로는 원문인 말이 섞인다. 그래서 묶음을 줄인다.
 */
export function packPurifyItems(items: PurifyItem[]): PurifyItem[] {
  const kept: PurifyItem[] = [];
  let used = 0;
  for (const item of items) {
    const cost = item.id.length + item.text.length + 24;
    if (used + cost > AI_INPUT_LIMIT) break;
    kept.push(item);
    used += cost;
  }
  return kept;
}

/**
 * 코드펜스 안에 든 JSON 을 꺼낸다. 무료 모델은 자주 붙인다.
 *
 * **배열 형태도 받아 준다** — 지시한 모양(`{"items":[…]}`)을 지키지 않고 그냥 배열로
 * 답하는 모델이 실제로 있다. 이쪽이 더 관용이어야 한다: 형식을 못 맞추는 것은
 * **버려도 되는 실패**지만, 형식이 틀렸다고 좋은 결과를 버리면 안 된다.
 */
function unwrapJson(raw: string): string | null {
  const text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : text).trim();

  // **몸통부터** 시도한다. 중괄호로 먼저 잘라내면 `[{…}]` 에서 **안쪽 객체만** 잘려
  // 나가고, 배열이 아니라 객체로 읽혀 항목이 조용히 0개가 된다(실제로 그랬다).
  const objStart = body.indexOf("{");
  const objEnd = body.lastIndexOf("}");
  const arrStart = body.indexOf("[");
  const arrEnd = body.lastIndexOf("]");
  const candidates = [
    body,
    objStart !== -1 && objEnd > objStart ? body.slice(objStart, objEnd + 1) : null,
    arrStart !== -1 && arrEnd > arrStart ? body.slice(arrStart, arrEnd + 1) : null,
  ].filter((value): value is string => value !== null);

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed) || (typeof parsed === "object" && parsed !== null)) return candidate;
    } catch {
      // 다음 후보를 본다.
    }
  }
  return null;
}

/**
 * 모델 응답에서 항목별 결과를 꺼낸다.
 *
 * **`id → text` 로 만든다.** 배열 순서에 의존하지 않는다 — 모델이 순서를 바꿔도, 하나를
 * 빼먹어도, 앞뒤에 설명을 붙여도 **요청한 id 의 결과만** 받아온다. 모르는 id 는 버린다
 * (`UNKNOWN_ID` 로 남길 수 있도록 함께 돌려준다).
 */
export function parsePurifyResponse(raw: unknown): { items: Map<string, string>; unknown: string[] } {
  const items = new Map<string, string>();
  const unknown: string[] = [];
  if (typeof raw !== "string") return { items, unknown };

  const json = unwrapJson(raw);
  if (!json) return { items, unknown };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { items, unknown };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { items?: unknown }).items)
      ? ((parsed as { items: unknown[] }).items)
      : null;
  if (!list) return { items, unknown };

  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, text } = entry as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof text !== "string") continue;
    // 중복 id 는 뒤에 온 것을 버린다 — 어느 것이 맞는 결과인지 알 수 없다.
    if (items.has(id)) {
      items.delete(id);
      unknown.push(id);
      continue;
    }
    items.set(id, text);
  }

  return { items, unknown };
}

/* ── 두 단계 검사 ───────────────────────────────────────────── */

/** 원문에서 **반드시 살아남아야 하는** 것. 사라지면 순화가 아니라 삭제다. */
function mustKeepTokens(original: string): string[] {
  const tokens = new Set<string>();
  // 숫자와 그 뒤 단위(3시, 50%, 2번) — 사람이 약속한 사실.
  for (const m of original.matchAll(/\d+\s*(?:시|분|일|번|%|명|개|시간|주|달|년|월)?/g)) tokens.add(m[0].trim());
  // 라틴어(API, PPT, GitHub) — 업무 대상과 고유명사.
  for (const m of original.matchAll(/[A-Za-z][A-Za-z0-9._-]*/g)) {
    if (m[0].length >= 2) tokens.add(m[0]);
  }
  // 업무의 시간·기한 어휘.
  for (const word of ["내일", "오늘", "모레", "마감", "회의", "자료", "제출", "보고서", "발표"]) {
    if (original.includes(word)) tokens.add(word);
  }
  return [...tokens];
}

/** 순화본이 **원문보다 얼마나 길어져도** 그럴듯하다고 볼지. */
const MAX_GROWTH_CHARS = 40;
const MAX_GROWTH_RATIO = 2;

/**
 * 순화본에 **남으면 안 되는 낱말**.
 *
 * 이건 **표시를 가리는 목록이 아니다.** 화면에 `***` 로 대신 보여 주기 위한 것이 아니라
 * "이건 순화가 아니다" 하고 **결과를 버리기 위한** 표다. 그래서 가리는 기능과 목적이
 * 정반대다 — 가리는 게 아니라 **거부**한다.
 */
const MUST_NOT_REMAIN = [
  // 욕설
  "씨발", "씨바", "시발", "새끼", "병신", "지랄", "썅", "개새",
  // 비꼼·조롱하는 비유 (사람에게 붙이는 것만)
  "좀비", "바보", "멍청이", "멍청한", "한심", "바보같", "쓰레기같",
  // 상대를 지목해 탓하는 표현
  "니 탓", "네 탓", "다 니 탓", "다 네 탓", "다 니가", "다 네가",
  // 비웃음
  "ㅋㅋ", "대충이네", "대충이야", "대충인데", "재미없네", "맘에 안 드", "실망이다", "한심하",
];

/** 위험 표현을 **가릴** 자리표. 문장을 새로 쓰지 않고 그 자리만 대체한다. */
const REDACTION = "••";

/**
 * 이 순화본을 **버려야 하는가** — 2단계 검사의 두 번째 단계(의미·안전).
 *
 * 버리는 경우는 넷이고, 모두 "이건 순화가 아니야" 다.
 * 1. **욕·비꼼·조롱이 그대로 남아 있다.** 가장 흔하다(실측 3/3).
 * 2. **핵심 정보가 사라졌다.** "민수가 API 배포 오늘까지 한다" → "조금 더 신경 써주세요" 는
 *    공격성은 0 이지만 **정보가 죽었다.** 순화의 목표는 `공격성↓ 사실≈ 의도≈ 새 정보=0` 이다.
 * 3. **길이 폭주.** 원문 두 글자에 두 문장이 나오면 순화가 아니라 지어내기다.
 * 4. **빈 글.** 말이 사라지면 순화가 아니라 삭제다.
 *
 * **감정 표현은 걸러 내지 않는다**("짜증", "실망"…). 순화는 말투의 일이지 감정을 지우는 일이
 * 아니다 — 그것까지 지우면 사람이 한 말을 사람이 안 한 것처럼 읽힌다.
 */
export function rejectsPurified(original: string, purified: string): CushionReason | null {
  const text = purified.trim();
  if (text.length === 0) return CUSHION_REASON.EMPTY_OUTPUT;
  if (MUST_NOT_REMAIN.some((word) => text.includes(word))) return CUSHION_REASON.TOXICITY_REMAINED;
  if (text.length > original.trim().length * MAX_GROWTH_RATIO + MAX_GROWTH_CHARS) {
    return CUSHION_REASON.TOO_LONG;
  }

  const lost = mustKeepTokens(original).filter((token) => !text.includes(token));
  if (lost.length > 0) return CUSHION_REASON.INFO_LOST;

  return null;
}

/**
 * 이 한 항목의 판정 — 응답 하나에 대한 전부.
 *
 * 1단계(구조): 응답에 있나, id 가 아는가, 비어 있나.
 * 2단계(의미·안전): `rejectsPurified` — 욕이 남았나, 정보가 죽었나, 길이가 폭주했나.
 *
 * 어느 단계든 실패하면 **그 항목만** `REJECTED` 다. 묶음 전체를 버리지 않는다 — 10개 중
 * 8개가 멀쩡하면 8개는 순화되고 2개만 원문으로 남는다.
 */
export function judgeOne(
  item: PurifyItem,
  got: string | undefined,
): { status: "PURIFIED" | "REJECTED"; text?: string; reason?: CushionReason } {
  if (got === undefined) return { status: "REJECTED", reason: CUSHION_REASON.EMPTY_RESPONSE };
  const reason = rejectsPurified(item.text, got);
  if (reason) return { status: "REJECTED", reason };
  return { status: "PURIFIED", text: got.trim() };
}

/**
 * 항목별 판정을 한 번에.
 *
 * 모델이 **거절했다**면(안전 필터) 항목마다 `MODEL_REFUSAL` 이 되며, 그 항목들은
 * `decideFallback` 이 규칙 가림으로 이어받는다. 전체가 거절인지 일부만 거절인지는 여기서
 * 구분하지 않는다 — 그 판단은 호출한 쪽이 하고, 최종적으로 **`FALLBACK` 이 하나라도 있으면
 * 그 묶음은 "모델은 실패했다"** 고 기록된다.
 */
export function judgeAll(
  items: PurifyItem[],
  response: { items: Map<string, string>; unknown: string[] },
): Array<{ id: string; status: "PURIFIED" | "REJECTED"; text?: string; reason?: CushionReason }> {
  const unknown = new Set(response.unknown);
  return items.map((item) => {
    if (unknown.has(item.id)) {
      return { id: item.id, status: "REJECTED" as const, reason: CUSHION_REASON.UNKNOWN_ID };
    }
    return { id: item.id, ...judgeOne(item, response.items.get(item.id)) };
  });
}

/** 모델이 이 응답을 **거절**한 것인가. */
export function isRefusal(raw: unknown): boolean {
  return typeof raw === "string" && REFUSAL_MARKS.test(raw.trim());
}

/* ── 결정론적 가림 (AI 실패 시) ─────────────────────────────── */

/**
 * **AI 없이** 위험 표현만 가린다.
 *
 * ## 왜 이것이 P0인가
 *
 * 실측: `openrouter/free` 는 욕설이 든 말에 `User Safety: unsafe (Profanity, Harassment)`
 * 를 그대로 돌려주거나 빈 응답을 준다. **순화가 가장 필요한 자리에서 기능이 꺼지는 것**이
 * 이 구조의 가장 큰 실패다. 규칙 가림은 100% 동작하고 비용이 없다.
 *
 * ## 왜 "가림" 이지 "순화" 가 아닌가
 *
 * 단어를 지우면 문장이 깨진다(실측: "다 니 탓인데" → "인데"). **문장을 새로 쓰는 건 모델의
 * 일**이고, 규칙이 대신 하면 뜻이 뒤집힌다. 그래서 **그 자리만 가리고 나머지는 그대로 둔다.**
 *
 * 그리고 **AI 결과인 척 하지 않는다.** 상태가 `FALLBACK`, `source="mask"` 이고 화면 라벨이
 * "순화됨" 이 아니라 **"공격적 표현 가림"** 이다.
 *
 * 위험한 말이 **하나도 없으면** 가림본을 만들지 않는다 — 없는 것을 가렸다고 말하지 않는다.
 */
export function maskRiskyParts(text: string): { text: string; masked: number } {
  const patterns: RegExp[] = [
    // 욕설
    /씨발이요|씨발이야|씨발을|씨발은|씨발|씨바|시발/g,
    /개새끼|개새/g,
    /병신|지랄|썅/g,
    // 사람에게 붙이는 비꼼
    /좀비|바보같이|바보야|바보|멍청이|멍청한|한심한|한심하|쓰레기같이/g,
    // 원인을 상대에게 돌리는 말
    /다 니 탓|니 탓|다 네 탓|네 탓|다 니가|다 네가|니가 한 거|네가 한 거/g,
    // 비웃음
    /ㅋㅋ+/g,
    /대충이네|대충이야|대충인데/g,
    // 구제 명령
    /처음부터 다 버려라|버려라/g,
    /닥쳐|조용히 해|그만해/g,
  ];

  let masked = 0;
  let out = text;
  for (const pattern of patterns) {
    out = out.replace(pattern, () => {
      masked += 1;
      return REDACTION;
    });
  }

  // 가린 자리가 남으면 문장이 어색해진다("너는 진짜 ••야"). 그럴 땐 가림을 취소한다 —
  // 깨진 문장은 원문보다 나쁘다. 대신 **FALLBACK 을 만들지 않는다**(아래에서 알린다).
  out = out.replace(/\s{2,}/g, " ").trim();
  if (masked > 0 && isBrokenAfterMask(out)) return { text, masked: 0 };
  return { text: out, masked };
}

/** 가린 뒤 문장이 부서졌는지 — 조사가 남거나 낱말이 줄줄이 이어지면 깨진 것이다. */
function isBrokenAfterMask(text: string): boolean {
  if (text.includes("••")) return false;
  // 가린 자리가 하나도 없는데 바뀌었다면 규칙이 문장을 뜯어낸 것이다.
  return !/[가-힣A-Za-z0-9]/.test(text.slice(0, 12));
}

/** 규칙으로 가릴 수 있는 표현이 남아 있는가 — 즉 이 방에 fallback 이 필요한가. */
export function needsMask(original: string): boolean {
  return maskRiskyParts(original).masked > 0;
}

/* ── 표시 ───────────────────────────────────────────────────── */

/**
 * 말풍선에 **어떤 글**을 그릴지.
 *
 * 규칙은 둘이다.
 * 1. 그릴 문장이 있고 원문을 보고 있지 않으면 **그 문장**(순화문 또는 가림본).
 * 2. 나머지는 전부 **원문** — 아직 처리 중이거나, 실패했거나, 누르고 있다.
 *
 * 실패·거절이 **원문으로 넘어가는 길이 이것 하나뿐**이다. 사용자에게는 숨기지 않는다.
 */
export function displayTextOf(
  message: Pick<ChatMessage, "text" | "purified">,
  showOriginal: boolean,
): { text: string; kind: CushionStatus | null } {
  const shown = message.purified?.text ?? null;
  if (shown === null || showOriginal) return { text: message.text, kind: null };
  return { text: shown, kind: message.purified?.status ?? null };
}

/**
 * 읽기 순화 설정 — **끄는 길은 없다**(이건 기획 결정이다). `tone` 만 있다.
 *
 * `tone` 이 null 이면 아직 고르지 않았다. 규칙상 첫 순화는 첫 말투로 돈다.
 */
export type ReadCushionSetting = { tone: string | null };

/** 아무것도 정하지 않은 상태. */
export const READ_CUSHION_DEFAULT: ReadCushionSetting = { tone: null };

/** 읽는 말투. 고른 것이 없으면 첫 말투. */
export function toneOf(setting: { tone: string | null }): string {
  return isCushionTone(setting.tone) ? setting.tone : CUSHION_TONES[0]?.key ?? "soft";
}

/** 말투가 세 값 중 하나인지. 모르는 값은 그대로 두지 않는다. */
export function isCushionTone(value: unknown): value is string {
  return typeof value === "string" && CUSHION_TONES.some((tone) => tone.key === value);
}

/** 말투가 실제로 바뀌었는지 — 바뀌었으면 이 방의 순화본을 지워 다시 만든다. */
export function toneChanged(before: string | null | undefined, next: string): boolean {
  return before !== null && before !== undefined && before !== next;
}
