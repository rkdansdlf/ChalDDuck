/**
 * 읽기 도움(19 화면 · 31 화면)의 **계약**.
 *
 * 이 파일 하나가 "무엇을 다듬고, 무엇을 버리고, 실패하면 무엇을 보여 주는가" 를 정한다.
 * 화면과 서버가 **같은 함수**를 쓰는 이유가 그것이다 — 두 곳이 따로 판단하면
 * "화면은 다 읽기 도움됐다고 믿는데 서버는 일부만 시킨다" 는 상태가 조용히 생기고, 그건
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

import { CUSHION_DEFAULT_MODE, CUSHION_TONES } from "@/data/catalog";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import type { ChatMessage, CushionLevelKey } from "@/lib/types";

/* ── 상태와 이유 ─────────────────────────────────────────────── */

/**
 * 이 말(읽는 사람, 메시지) 하나가 지금 어디까지 갔는가.
 *
 * `PURIFIED` / `FALLBACK` 만 **끝**이고, 나머지는 같은 설정으로는 다시 시도하지 않는다.
 */
export const CUSHION_STATUS = ["PENDING", "PURIFIED", "FALLBACK", "REJECTED", "FAILED"] as const;
export type CushionStatus = (typeof CUSHION_STATUS)[number];

/** 끝난 상태 — 다시 부르지 않는다. 화면은 이때 다듬은 말(또는 가림본)을 그린다. */
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
  /** 원문보다 지나치게 길다. 읽기 도움이 아니라 지어내기다. */
  TOO_LONG: "TOO_LONG",
  /** 오늘 쓸 수 있는 AI 횟수가 다났다. */
  RATE_LIMITED: "RATE_LIMITED",
  /** AI 키가 없다. */
  NO_MODEL: "NO_MODEL",
  /**
   * 한국어 입력을 **영어(또는 다른 언어)** 로 되돌려왔다.
   *
   * 실측: 무료 모델이 두 번 중 한 번은 영어로 답했다. 한국어 채팅에 영어가 올라오면 그건
   * 읽기 도움이 아니라 **번역**이고, 그대로 보이면 사람이 말이 다른 사람이 된 것처럼 읽힌다.
   */
  LANGUAGE_DRIFT: "LANGUAGE_DRIFT",
  /**
   * 고치는 대신 **되물었다.** ("왜 그러세요? 좀비 같아 보여요.")
   *
   * 읽기 도움의 대상은 "고쳐서 보여 줄 문장" 이지 상대에게 할 말이다. 되물은 결과는 원문의
   * 뜻이 뒤집힌 셈이라 버린다.
   */
  REPLY_INSTEAD_OF_REWRITE: "REPLY_INSTEAD_OF_REWRITE",
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
export const PROMPT_VERSION = "p2";

/** 검사 버전. 규칙을 손보면 올린다(위와 같은 이유로 실패가 다시 열린다). */
export const VALIDATOR_VERSION = "v2";

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
 * 영영 "처리 중"으로 남아 다듬은 말을 영영 못 받는다.
 */
export const CLAIM_TTL_MS = 90 * 1000;

/** 한 번에 묶어서 부르는 말의 수. */
/**
 * **몇 개의 앞말을 문맥으로 줄 것인가 — 정확히 2개.**
 *
 * 0개면 "이게 뭐야" 를 몰라서 읽기 도움이 느슨해지고(한국어 욕설은 앞뒤로 세어야 하는 경우가 많다),
 * 많으면 **캐시가 깨진다.** "이 방의 최근 N 말" 을 문맥으로 주면 같은 말을 읽는 사람마다
 * 뒤에 있는 말의 수가 달라져 결과가 사람마다 달라진다 — 다듬은 말 공유(한 결과를 여럿이 씀)가
 * 그것으로 무너진다. 그래서 **각 말의 앞 2개로 고정**한다: 같은 말은 어디서 읽든 같은 입력을
 * 갖는다. 그래서 읽기 도움은 결정함수이고 캐시가 맞다.
 *
 * 실측: 앞 2개를 주니 "약속" 을 지키지 못한 말도 문장만 다듬어 남길 수 있었다(앞말에
 * 약속이 있었음을 모델이 알았다).
 */
export const PURIFY_CONTEXT_MESSAGES = 2;

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

/**
 * 이 묶음을 보낸 뒤 **앞으로 더 손대야 할 말**이 몇 개 남았나.
 *
 * 화면이 멈추는 기준이 이 값이다 — 0 이 아니면 다음 묶음을 예약한다(그리고 그 사이는
 * `DRAIN_RETRY_MS` 다). 그래서 **음수가 나면 안 된다.** 음수(`!== 0`)는 "남았다" 와 같아서,
 * AI 를 쓸 이유가 없는 상태에서 묶음을 계속 부른다.
 *
 * ## "선점에서 진 말"도 남은 것으로 센다
 *
 * 같은 사람이 두 탭에서 같은 방을 보고 있으면 그럴 수 있다. 그 말은 이 요청이 **못 가져간
 * 것**이지 사라진 것이 아니다 — 다듬은 말이 아직 없다. 그래서 0 이 아니다.
 *
 * 그러면 언제 0 이 되는가. `canRetry` 이 **아직 유효한 선점(`PENDING`)** 을 걸러내기 때문이다.
 * 상대가 부르는 중이던 말은 다음 부름의 후보에 **아예 들어가지 않고**, 그래서 이 수에서 빠진다.
 * `claimable` 이 `canRetry` 의 결과로 이미 걸러진 목록이라는 것이 이 계약의 전부다 — 그
 * 필터를 빼면 남은 수는 영영 줄지 않는다.
 *
 * @param claimable 지금 부를 수 있다고 판정된 대상 말의 수(`canRetry` 통과)
 * @param processed 이번에 **모델에 보내 처리한** 말의 수
 */
export function remainingPurify(claimable: number, processed: number): number {
  return Math.max(0, claimable - processed);
}

/* ── 읽기 도움 대상 판정 ─────────────────────────────────────────── */

/** 읽기 도움이 고를 수 있는 말의 최소 길이. 한 글짜리는 다듬을 대상이 아니다. */
const MIN_TEXT_LENGTH = 2;

/**
 * 이 글에 다듬은 말을 만들 수 있는가.
 *
 * 서버도 **같은 규칙**으로 걸러야 한다 — 화면이 골라 준 id 를 그대로 믿으면 읽기 도움 대상이 아닌
 * 말(내 말, 파일만 보낸 말)에 대한 AI 호출이 생기고, 그 결과가 저장이 된다.
 */
export function isPurifiableText(text: string): boolean {
  return text.trim().length >= MIN_TEXT_LENGTH;
}

/** 이 말을 읽기 도움으로 다듬어도 되는가. */
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
/**
 * **문맥 항목 하나.**
 *
 * 앞에 붙는 말은 **읽을 대상이 아니다.** 읽기 도움으로 다듬지도, 출력하지도, 답하지도 않는다.
 * 이것을 `{ id, text }` 와 같은 모양으로 주면 모델이 **문맥을 고쳐 적는다** — 실측에서
 * 정확히 그 일이 났다(인사한 말에 답을 붙여 보내는 모델). 그래서 모양이 다르다.
 */
export type PurifyContext = { text: string };

export type PurifyRequest = {
  task: "rewrite_for_reader_comfort";
  items: Array<{ id: string; text: string; before: PurifyContext[] }>;
};

/**
 * 모델에게 넘기는 형태로 만든다.
 *
 * ## 왜 `before` 를 항목마다 붙이는가 (P2)
 *
 * **"이 방의 최근 N 말"** 을 문맥으로 주면 안 된다. 그건 **읽는 사람마다 시점이 달라**
 * 같은 말의 결과가 사람마다 달라지고, 공유(한 결과를 여럿이 씀)가 깨진다. 화면을 여는
 * 사람에 따라 뒤에 오는 말의 개수가 달라진다는 뜻이다.
 *
 * 그래서 **각 말의 바로 앞 2개로 고정한다.** 같은 말은 어디서 읽든 같은 문맥을 갖는다 —
 * 그래서 결과는 결정함수이고 캐시가 맞다. "지금 이 방의 뒷부분"은 읽기 도움의 **입력** 이 될 수
 * 있어도 **읽기 결과** 를 만들 근거가 될 수 없다.
 *
 * `before` 는 항목마다 붙는다. 묶음 하나에 앞문맥 하나만 주면 **묶음에서 두 번째 이후의
 * 말은 문맥을 잘못 받는다**(이전 묶음의 말).
 */
export function buildPurifyRequest(items: Array<PurifyItem & { before?: PurifyContext[] }>): string {
  const request: PurifyRequest = {
    task: "rewrite_for_reader_comfort",
    items: items.map((item) => ({
      id: item.id,
      text: item.text,
      before: (item.before ?? []).map((ctx) => ({ text: ctx.text })),
    })),
  };
  return JSON.stringify(request);
}

/**
 * 묶음을 상한에 맞춰 **줄인다** — 자르지 않는다.
 *
 * `model.ts` 의 `clampInput` 이 조용히 자르면 잘린 말은 다듬어지지 않은 채 남아, 화면에는
 * "다 읽기 도움됐다" 고 보이지만 실제로는 원문인 말이 섞인다. 그래서 묶음을 줄인다.
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

/** 원문에서 **반드시 살아남아야 하는** 것. 사라지면 읽기 도움이 아니라 삭제다. */
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

/** 다듬은 말이 **원문보다 얼마나 길어져도** 그럴듯하다고 볼지. */
const MAX_GROWTH_CHARS = 40;
const MAX_GROWTH_RATIO = 2;

/**
 * 말의 **마무리 강도**가 사라졌는지 보는 표.
 *
 * 실측 반례: "나 진짜 짜증나 죽겠어" → "나 진짜 짜증나". 길이는 67% 라 길이 규칙으로는 안 잡히고,
 * 욕도 지워지지 않았다. 그런데 **"죽겠어" 라는 말의 마무리가 통째로 사라졌다** — 사람이 한 말의
 * 온기가 줄었는데, 읽기 도움은 말투를 바꾸는 것이지 말을 짧게 만드는 것이 아니다.
 *
 * 그래서 **원문의 끝부분에 이런 마무리가 있으면 읽기 도움문에도 하나는 남아 있어야 한다.**
 * 읽기 도움이 필요한 말은 대개 길이가 비슷하므로, 이것만으로 "요약으로 잘린 경우"를 거의 걸러 낸다.
 */
// **강한 마무리만** 넣는다. "해" 같은 흔한 어미를 넣으면 "가능해?" → "가능할까요?" 처럼
// 정상적인 읽기 도움이 잘못 걸린다(실제로 걸렸다).
const ENDING_MARKS = ["겠어", "겠다", "거든", "잖아", "겠냐", "해라", "이래", "이거야"];

/**
 * 원문의 끝에 있던 마무리 강도가 읽기 도움문에서 사라졌는가 — **단, 읽기 도움문이 짧을 때만.**
 *
 * 이 검사는 **잘라내기**를 잡는 것이다. 그런데 모든 경우에 적용하면 **정상적인 다시쓰기까지
 * 막는다** — 실측으로 막혔다: "너 때문에 다 꼬였잖아" 를 "이 부분이 어떻게 됐는지 확인해볼게요"
 * 로 고치는 것은 완전히 정상인데, 원문의 "잖아" 가 사라졌다는 이유로 버렸다.
 *
 * 그래서 **읽기 도움문이 짧을 때(원문의 85% 미만)만** 본다. 길이가 비슷하면 말의 끝을 바꿔도
 * "잘라낸 것" 이 아니며, 그때는 다른 검사가(요구·마감·숫자) 지킨다.
 */
function lostEnding(original: string, purified: string): boolean {
  if (purified.length >= original.trim().length * 0.85) return false;
  const tail = original.trim().slice(-10);
  const had = ENDING_MARKS.filter((mark) => tail.includes(mark));
  if (had.length === 0) return false;
  return !had.some((mark) => purified.includes(mark));
}

/**
 * 다듬은 말이 원문의 몇 퍼센트까지 짧아져도 되는가.
 *
 * 실측에서 나온 반례: "나 진짜 짜증나 죽겠어" → **"나 진짜 짜증나"**. 욕은 지워지지 않았고
 * 길이도 폭주하지 않아 기존 검사를 통과했다 — 그런데 **말의 끝이 잘려 있었다.** 읽기 도움은
 * 말투의 일이지 요약을 하는 일이 아니다. 절반 아래로 줄면 요구·사정이 통째로 사라질 수 있다.
 *
 * 읽기 도움이 정말 필요한 말은 보통 길이가 비슷하다. 절반 아래로 줄인 결과는 **버린다**
 * (`INFO_LOST`) — 그 말은 원문이 보인다.
 */
const MIN_LENGTH_RATIO = 0.5;

/**
 * 다듬은 말에 **남으면 안 되는 낱말**.
 *
 * 이건 **표시를 가리는 목록이 아니다.** 화면에 `***` 로 대신 보여 주기 위한 것이 아니라
 * "이건 읽기 도움이 아니다" 하고 **결과를 버리기 위한** 표다. 그래서 가리는 기능과 목적이
 * 정반대다 — 가리는 게 아니라 **거부**한다.
 */
/**
 * 강도별 프로필 — **세 곳을 한 표로 묶는다.**
 *
 * 1. `guide`  : 모델에게 줄 지시(몇까지 고치라)
 * 2. `banned` : 다듬은 말에 남으면 버릴 낱말(몇까지 지워졌나 확인)
 * 3. `mask`   : AI 가 거절했을 때 규칙으로 가릴 패턴(몇까지 가릴 수 있나)
 *
 * 이것을 셋으로 따로 두면 "약하게 다듬으라 고 했는데 검사는 강하게 한다" 같은 어긋남이
 * 생기고, 어느 쪽이 문제인지 알 수 없다. **세 기준은 반드시 같은 표에서 나온다.**
 */
type LevelProfile = {
  guide: string;
  banned: string[];
  mask: RegExp[];
};

const PROFANITY: RegExp[] = [/씨[발박빡바](?:이요|이야|을|은|가)?|시[발빡바]/g, /개새끼|개새/g, /병신|지랄|썅/g];
/**
 * NORMAL 이 걸러 내는 가림 패턴.
 *
 * **낱말 목록(`INSULT_WORDS`)과 같은 땅을 져야 한다.** 실측 반례: 낱말 목록에는 "한심" 이
 * 있는데 패턴이 `한심한|한심하` 뿐이라 **"한심해" 가 그대로 통과했다** — 검사는 버리지만
 * 거짓말은 통과하고, 사람이 보는 화면에는 욕이 남는다. 코퍼스가 이 구멍을 찾았다.
 */
const INSULT: RegExp[] = [
  /좀비|바보같이|바보야|바보|멍청이|멍청한|한심(한|하|해|하다)|쓰레기같이/g,
  /다 니 탓|니 탓|다 네 탓|네 탓|다 니가|다 네가|니가 한 거|네가 한 거/g,
  // "너 때문에" — 실측에서 **실제로 살아남았던** 책임 전가 표현. 인과를 상대에게 돌리는
  // 가장 흔한 형태인데 목록에 없었다(코퍼스가 찾았다).
  /너 때문에|니가 때문에|네가 때문에/g,
  /ㅋㅋ+/g, /대충이네|대충이야|대충인데/g,
];
const ACCUSE: RegExp[] = [
  /처음부터 다 버려라|버려라/g, /닥쳐|조용히 해|그만해/g,
  /너는 진짜|너 진짜/g, /한심하게|한심하다/g,
];

/** 욕설·비속어만. */
const PROFANITY_WORDS = ["씨발", "씨박", "씨빡", "씨바", "시발", "새끼", "병신", "지랄", "썅", "개새"];

/**
 * ## 알려진 한계 (G 단계의 회귀 코퍼스가 다룰 자리)
 *
 * 여기서는 **패턴으로 잡히지 않는다**: "니가 왜 그랬어요" 처럼 **대명사만 남은** 탓.
 * "니가" 를 낱말로 막으면 정상적인 요청("니가 알아서 해 줘")까지 걸리고, "왜" 로 막으면
 * "왜 이렇게 됐어요?" 라는 정당한 질문까지 버려진다. 그래서 **하지 않았다** —
// 검사가 말을 막는 쪽이 더 나쁘다. 이 자리는 코퍼스로 실제 사례를 모은 뒤 판단한다.
 */

/** 욕설 + 비꼼·조롱·"니 탓". NORMAL 이상에서 남으면 버린다. */
const INSULT_WORDS = [
  ...PROFANITY_WORDS,
  "좀비", "바보", "멍청이", "멍청한", "한심", "바보같", "쓰레기같",
  "니 탓", "네 탓", "다 니 탓", "다 네 탓", "다 니가", "다 네가",
  // 인과를 상대에게 돌리는 표현 — 실측에서 실제로 남았던 "너 때문에" 포함.
  "너 때문에", "니가 때문에", "네가 때문에",
  "ㅋㅋ", "대충이네", "대충이야", "대충인데", "재미없네", "맘에 안 드", "실망이다",
];

/** STRONG 에서까지 남으면 버린다 — 책임 추궁과 구제 명령. */
const ACCUSE_WORDS = [...INSULT_WORDS, "버려라", "닥쳐", "조용히 해", "그만해", "너는 진짜", "너 진짜"];

const LEVEL_PROFILES: Record<CushionLevelKey, LevelProfile> = {
  LIGHT: {
    guide: "욕설과 비속어만 바꿉니다. **뜻과 말투는 그대로 두고 그 낱말만 가벼운 말로 바꿉니다.** 탓하는 말이나 조롱은 건드리지 마라.",
    banned: PROFANITY_WORDS,
    mask: PROFANITY,
  },
  NORMAL: {
    guide: "욕설과 비속어를 없애고, 비꼼과 상대를 지목해 탓하는 말은 부드럽게 바꿉니다. 요구와 마감, 시각은 그대로 둡니다.",
    banned: INSULT_WORDS,
    mask: [...PROFANITY, ...INSULT],
  },
  STRONG: {
    guide: "욕설·비속어·비꼼·책임 추궁까지 완화합니다. 상대를 지목해 미는 말은 내가 진지하게 걱정하는 말로 바꿉니다. **요구·마감·시각·이름·숫자는 하나도 지우지 마라.**",
    banned: ACCUSE_WORDS,
    mask: [...PROFANITY, ...INSULT, ...ACCUSE],
  },
};

/** 한국어를 쓰는 말인지. */
const HANGUL = /[가-힣]/;

/**
 * 고친 글이 **되물은 것**인지.
 *
 * "왜 그러세요?", "어떻게 하셨어요?" 처럼 **상대를 지목해 되묻는** 모양만 좁게 잡는다.
 * "내일 몇 시로 가능할까요?" 처럼 원문에도 있던 질문은 통과시킨다 — 다듬는 동안 질문을
 * 만드는 것은 정상이고, 그것까지 막으면 읽기 도움이 될 말을 지운다.
 */
const ASKS_BACK = /왜\s*(그러|그래|합|해|하|했)|어떻게\s*(했|하|했어|하셨어)/;

/** 남으면 버리는 낱말은 **강도별로** 다르다 — `LEVEL_PROFILES` 를 본다. */
/** 위험 표현을 **가릴** 자리표. 문장을 새로 쓰지 않고 그 자리만 대체한다. */
const REDACTION = "••";

/**
 * 이 다듬은 말을 **버려야 하는가** — 2단계 검사의 두 번째 단계(의미·안전).
 *
 * 버리는 경우는 넷이고, 모두 "이건 읽기 도움이 아니야" 다.
 * 1. **욕·비꼼·조롱이 그대로 남아 있다.** 가장 흔하다(실측 3/3).
 * 2. **핵심 정보가 사라졌다.** "민수가 API 배포 오늘까지 한다" → "조금 더 신경 써주세요" 는
 *    공격성은 0 이지만 **정보가 죽었다.** 읽기 도움의 목표는 `공격성↓ 사실≈ 의도≈ 새 정보=0` 이다.
 * 3. **길이 폭주.** 원문 두 글자에 두 문장이 나오면 읽기 도움이 아니라 지어내기다.
 * 4. **빈 글.** 말이 사라지면 읽기 도움이 아니라 삭제다.
 *
 * **감정 표현은 걸러 내지 않는다**("짜증", "실망"…). 읽기 도움은 말투의 일이지 감정을 지우는 일이
 * 아니다 — 그것까지 지우면 사람이 한 말을 사람이 안 한 것처럼 읽힌다.
 */
export function rejectsPurified(
  original: string,
  purified: string,
  level: CushionLevelKey = CUSHION_DEFAULT_MODE,
): CushionReason | null {
  const profile = LEVEL_PROFILES[level];
  const text = purified.trim();
  if (text.length === 0) return CUSHION_REASON.EMPTY_OUTPUT;
  if (profile.banned.some((word) => text.includes(word))) return CUSHION_REASON.TOXICITY_REMAINED;

  // **언어와 방향은 나머지 검사보다 먼저 본다.** 길이·마무리·정보 검사는 모두 한국어라고
  // 가정하고 있는데, 영어로 돌아온 결과에 그 검사들을 적용하면 "INFO_LOST" 라는 **엉뚱한
  // 이유**로 남는다(실측: 영어 응답이 INFO_LOST 로 기록됐다). 원인이 드러는 자리가 없다.
  if (HANGUL.test(original) && !HANGUL.test(text)) return CUSHION_REASON.LANGUAGE_DRIFT;
  if (ASKS_BACK.test(text) && !ASKS_BACK.test(original)) return CUSHION_REASON.REPLY_INSTEAD_OF_REWRITE;

  if (text.length > original.trim().length * MAX_GROWTH_RATIO + MAX_GROWTH_CHARS) {
    return CUSHION_REASON.TOO_LONG;
  }
  // **요약으로 잘린 결과**는 읽기 도움이 아니다. 욕은 그대로 두고 말의 끝만 사라졌다.
  if (text.length < original.trim().length * MIN_LENGTH_RATIO) return CUSHION_REASON.INFO_LOST;
  if (lostEnding(original, text)) return CUSHION_REASON.INFO_LOST;

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
 * 8개가 멀쩡하면 8개는 다듬어지고 2개만 원문으로 남는다.
 */
export function judgeOne(
  item: PurifyItem,
  got: string | undefined,
  level: CushionLevelKey = CUSHION_DEFAULT_MODE,
): { status: "PURIFIED" | "REJECTED"; text?: string; reason?: CushionReason } {
  if (got === undefined) return { status: "REJECTED", reason: CUSHION_REASON.EMPTY_RESPONSE };
  const reason = rejectsPurified(item.text, got, level);
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
  level: CushionLevelKey = CUSHION_DEFAULT_MODE,
): Array<{ id: string; status: "PURIFIED" | "REJECTED"; text?: string; reason?: CushionReason }> {
  const unknown = new Set(response.unknown);
  return items.map((item) => {
    if (unknown.has(item.id)) {
      return { id: item.id, status: "REJECTED" as const, reason: CUSHION_REASON.UNKNOWN_ID };
    }
    return { id: item.id, ...judgeOne(item, response.items.get(item.id), level) };
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
 * 를 그대로 돌려주거나 빈 응답을 준다. **읽기 도움이 가장 필요한 자리에서 기능이 꺼지는 것**이
 * 이 구조의 가장 큰 실패다. 규칙 가림은 100% 동작하고 비용이 없다.
 *
 * ## 왜 "가림" 이지 "읽기 도움" 가 아닌가
 *
 * 단어를 지우면 문장이 깨진다(실측: "다 니 탓인데" → "인데"). **문장을 새로 쓰는 건 모델의
 * 일**이고, 규칙이 대신 하면 뜻이 뒤집힌다. 그래서 **그 자리만 가리고 나머지는 그대로 둔다.**
 *
 * 그리고 **AI 결과인 척 하지 않는다.** 상태가 `FALLBACK`, `source="mask"` 이고 화면 라벨이
 * "읽기 도움됨" 이 아니라 **"공격적 표현 가림"** 이다.
 *
 * 위험한 말이 **하나도 없으면** 가림본을 만들지 않는다 — 없는 것을 가렸다고 말하지 않는다.
 */
export function maskRiskyParts(
  text: string,
  level: CushionLevelKey = CUSHION_DEFAULT_MODE,
): { text: string; masked: number } {
  // **가릴 범위도 단계마다 다르다.** `LEVEL_PROFILES` 와 같은 표에서 나온다 — 검사만
  // 단계에 따라 가리는 범위가 그대로면, 약한 단계에서 걸러 낼 것을 약하게 읽는 사람이 버린다.
  const patterns: RegExp[] = LEVEL_PROFILES[level].mask;

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
export function needsMask(original: string, level: CushionLevelKey = CUSHION_DEFAULT_MODE): boolean {
  return maskRiskyParts(original, level).masked > 0;
}

/* ── 측정(F) ─────────────────────────────────────────────────── */

/**
 * 이 행이 **무엇을 말하는지** — 한 계단짜리 말로.
 *
 * 상태·이유를 그대로 세면(`REJECTED` 12개) **왜** 줄었는지 알 수 없다. 지표는 사람이
 * 다음 결정을 내릴 수 있는 크기여야 한다: 모델을 바꿀까, 프롬프트를 고칠까, 검사를
 * 느슨하게 할까.
 */
export type CushionBucket = "done" | "masked" | "refused" | "rejected" | "failed" | "pending";

export function cushionBucketOf(row: {
  status: CushionStatus;
  reason: CushionReason | null;
  source: string | null;
}): CushionBucket {
  if (row.status === "PENDING") return "pending";
  if (row.status === "PURIFIED") return "done";
  if (row.status === "FALLBACK") return "masked";
  // 거절·한도는 **모델 문제**고, 검사로 버린 것은 **검사(또는 프롬프트) 문제**다.
  if (row.reason === CUSHION_REASON.MODEL_REFUSAL || row.reason === CUSHION_REASON.RATE_LIMITED) {
    return "refused";
  }
  if (row.reason === CUSHION_REASON.NO_MODEL || row.reason === CUSHION_REASON.EMPTY_RESPONSE) {
    return "failed";
  }
  return "rejected";
}

/**
 * **읽기 도움 커버리지** — 읽기 도움 대상 말 중, 읽는 사람에게 안전하게 닿은 비율.
 *
 * `보통 · 강하게` 모드에서 메시지는 세 갈래로 갈린다: AI 가 다듬어 보여 줌(PURIFIED),
 * AI 가 거절해 규칙이 가림(FALLBACK), 아무것도 못 해 원문으로 보임(FAILED/REJECTED).
 * 읽는 사람이 **끊김 없이 읽을 수 있는** 비율이 이 숫자다 — "읽기 도움됨" 칩이 붙은 비율과
 * "원문이 그대로 보인" 비율의 합.
 *
 * 측정값의 해석(실측 16말): 협조적 11말은 PURIFIED, 다툰 말은 대부분 FALLBACK →
 * 커버리지는 높게 나오지만 **AI 가 한 일의 비율은 낮다.** 두 숫자를 따로 봐야
 * "모델을 바꿀지" 를 판단할 수 있다 — 커버리지만 높으면 기능은 돌아가고 있는 것이다.
 */
export function purificationCoverage(counts: Record<CushionBucket, number>): number {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;
  const safe = counts.done + counts.masked;
  return Math.round((safe / total) * 1000) / 1000;
}

/** AI 가 실제로 일을 한 비율(PURIFIED ÷ 전체). 커버리지와 함께 본다. */
export function purificationAiShare(counts: Record<CushionBucket, number>): number {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;
  return Math.round((counts.done / total) * 1000) / 1000;
}

/* ── 표시 ───────────────────────────────────────────────────── */

/**
 * 말풍선에 **어떤 글**을 그릴지.
 *
 * 규칙은 둘이다.
 * 1. 그릴 문장이 있고 원문을 보고 있지 않으면 **그 문장**(읽기 도움문 또는 가림본).
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
 * 읽기 도움 설정 — **사람마다, 방마다**.
 *
 * - `enabled` — 끄면 AI 호출 후보를 **아예 만들지 않는다.** 원문으로만 읽는다.
 * - `mode`    — 몇까지 세게 읽을지(LIGHT/NORMAL/STRONG).
 * - `tone`    — 같은 단계 안에서 말투(15 쿠션 번역기와 같은 세 값).
 *
 * `tone` 이 null 이면 아직 고르지 않았다. 규칙상 첫 읽기 도움은 첫 말투로 돈다.
 */
export type ReadCushionSetting = {
  enabled: boolean;
  mode: CushionLevelKey;
  tone: string | null;
};

/** 아무것도 정하지 않은 상태 — 팀 전체가 처음 갖는다. */
export const READ_CUSHION_DEFAULT: ReadCushionSetting = {
  enabled: true,
  mode: CUSHION_DEFAULT_MODE,
  tone: null,
};

/** 읽기 도움이 꺼져 있는가. 꺼져 있으면 후보를 만들지 않는다. */
export function cushionOff(setting: ReadCushionSetting): boolean {
  return setting.enabled === false;
}

/** 모르는 값이 들어와도 있는 것으로 본다 — 조용히 다른 단계로 읽지 않는다. */
export function levelOf(setting: ReadCushionSetting): CushionLevelKey {
  return setting.mode === "LIGHT" || setting.mode === "STRONG" ? setting.mode : CUSHION_DEFAULT_MODE;
}

/** 이 단계가 모델에게 줄 지시. */
export function levelGuide(level: CushionLevelKey): string {
  return LEVEL_PROFILES[level].guide;
}

/** 읽는 말투. 고른 것이 없으면 첫 말투. */
export function toneOf(setting: { tone: string | null }): string {
  return isCushionTone(setting.tone) ? setting.tone : CUSHION_TONES[0]?.key ?? "soft";
}

/** 말투가 세 값 중 하나인지. 모르는 값은 그대로 두지 않는다. */
export function isCushionTone(value: unknown): value is string {
  return typeof value === "string" && CUSHION_TONES.some((tone) => tone.key === value);
}

/** 말투가 실제로 바뀌었는지 — 바뀌었으면 이 방의 다듬은 말을 지워 다시 만든다. */
export function toneChanged(before: string | null | undefined, next: string): boolean {
  return before !== null && before !== undefined && before !== next;
}
