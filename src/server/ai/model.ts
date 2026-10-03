import "server-only";

import OpenAI from "openai";
import { extractJsonObject, missingRequired } from "@/lib/ai-json";
import { AI_INPUT_LIMIT } from "@/lib/ai-limit";
import type { AiToolKey } from "@/server/ai/limit";
import { currentAiCaller, noteCallWritten } from "@/server/ai/call-context";
import { db } from "@/server/db";

/**
 * 모델 호출 한 겹.
 *
 * 도구 5종이 쓰는 저수준 자리다. 프롬프트(무엇을 시킬지)는 `tools.ts` 에 있고,
 * 여기는 **어떻게 부르는지**만 안다 — 모델이나 공급자를 바꿀 때 고칠 곳이 한 곳이다.
 *
 * 공급자는 OpenRouter 다. OpenAI 호환 API 라 `openai` SDK 에 주소만 갈아 끼우면 되고,
 * 모델을 바꿀 때 코드가 아니라 `.env` 만 고치면 된다.
 *
 * ⚠️ 이 모듈은 서버 전용이다(`server-only`). API 키가 브라우저로 나가면 안 된다.
 */

/**
 * 쓰는 모델.
 *
 * 기본값 `openrouter/free` 는 무료 모델 중 하나를 **요청마다 무작위로** 고르는 라우터다.
 * 돈이 들지 않는 대신 어떤 모델이 걸릴지 모르고, 한국어 지시를 덜 정확히 따른다 —
 * 그래서 이 파일과 `tools.ts` 는 모델 출력을 그대로 믿지 않고 한 번 더 손본다.
 *
 * **도구마다 다른 모델을 쓴다** — `modelFor` 를 보면 된다. 값을 고르는 자리는 여기 한 곳이고,
 * 무엇을 고르느냐는 `.env` 다(`OPENROUTER_MODEL_<도구>`). 모델 이름을 코드에 박아두지 않는다 —
 * 무료 카탈로그는 OpenRouter 가 돌려주고, **며칠 지나면 목록이 바뀐다**(실측: 무료 모델
 * 16개 전부 세대가 달랐고 `anthropic/claude-sonnet-5` 같은 예전 슬러그는 목록에 없다).
 * 슬러그를 코드에 적으면 그때 조용히 깨진다.
 *
 * **유료 슬러그를 못 쓰게 하지는 않는다.** 유료로 바꾸는 것은 `.env` 한 줄이고, 그건
 * 사람이 정하는 지출이다 — `README` 가 "품질이 필요하면 유료 슬러그로 바꾸세요" 라고 적고
 * 있고 그 길은 살아 있다. 다만 **무엇을 쓰고 있는지 숨기지 않는다**: 아래의 계측이 호출마다
 * 모델 이름을 남긴다.
 */

/** `AiToolKey` → 환경 변수 이름 뒤쪽. 대소문자만 바꾸고 구분자도 뺀다. */
const ENV_SUFFIX: Record<AiToolKey, string> = {
  cushion: "CUSHION",
  clerk: "CLERK",
  research: "RESEARCH",
  present: "PRESENT",
  sentence: "SENTENCE",
  "read-cushion": "READ_CUSHION",
};

/** 값이 없으면 이 라우터가 된다 — 무료이고, 아무 슬러그도 기억하지 않아도 된다. */
const FREE_ROUTER = "openrouter/free";

/**
 * 그 도구를 부를 때 **어느 모델로** 부르는가.
 *
 * ## 세 겹으로 고른다
 *
 * 1. `OPENROUTER_MODEL_<도구>` — 그 도구만 따로 정한 값. (예: `OPENROUTER_MODEL_CLERK`)
 * 2. `OPENROUTER_MODEL` — 전체 기본값. 예전부터 있던 자리라 그대로 둔다.
 * 3. `openrouter/free` — 위 두 값이 모두 없을 때.
 *
 * **전부 비어 있을 때만 무료 라우터가 된다.** `.env` 에 `OPENROUTER_MODEL` 하나만 적혀 있으면
 * 그 값이 **여섯 도구 전부**의 기본이 된다는 뜻이므로, 도구별 차이를 만들려면 그 자리도
 * 비워 둔 상태에서 도구별 값만 채워야 한다. 이 성질은 안 바뀌었고, 고치려면 여기만 본다.
 *
 * ⚠️ 이 함수는 **읽기만 한다.** 계측(성공·실패·지연)이 붙으려 해도 여기서 값을 고쳐서는 안
 * 된다 — "무엇을 불렀다"와 "무엇이 됐나"는 다른 사실이고, 어느 쪽이든 한 곳에만 적어야
 * 두 값이 어긋나지 않는다.
 */
export function modelFor(tool: AiToolKey): string {
  return (
    process.env[`OPENROUTER_MODEL_${ENV_SUFFIX[tool]}`]?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    FREE_ROUTER
  );
}

/**
 * 첫 모델이 실패했을 때 **한 번만** 다시 부를 모델.
 *
 * 비워 두면 무료 라우터(`openrouter/free`)가 된다 — 여기에도 이유가 있다. 무료 라우터는
 * 요청마다 다른 무료 모델을 잡으므로, 첫 모델이 타임아웃이면 **다른 모델**을 한 번 더
 * 시도할 이유가 생긴다. 같은 슬러그로 다시 부르는 것은 시간을 두 배로 태우는 것에 가깝다.
 */
export function fallbackModelFor(tool: AiToolKey): string {
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL?.trim();
  const primary = modelFor(tool);
  // **같은 모델로 다시 부르지 않는다.** 첫 시도가 그 모델로 안 됐는데, 몇 밀리초 뒤에
  // 됐을 리 없다 — 사용자에게는 그만큼 더 기다리게 한 뒤 같은 실패를 받는 것이다.
  if (fallback && fallback !== primary) return fallback;
  if (primary !== FREE_ROUTER) return FREE_ROUTER;
  // primary 도 무료 라우터면 남는 게 없다. 그래도 한 번 더 부르는 것이 답이 없을 때보다 낫다.
  return FREE_ROUTER;
}

/**
 * 지금 쓰는 모델의 id.
 *
 * 순화 결과와 실패 상태에 **함께 남긴다** — "이건 어느 모델이 만든 것인가" 를 나중에
 * 알 수 없으면, 모델을 바꿨을 때 무엇을 다시 만들어야 하는지 판단할 수 없다.
 *
 * ⚠️ **도구 이름 없이 부르지 말 것.** 이 인자는 "전체 기본값"을 본다. 도구가 자기 모델을
 * 고르는 데 이미 `modelFor` 가 있으니, 여기서는 **기본값이 바뀌었는지** 볼 때만 쓴다.
 */
export function activeModelId(): string {
  return process.env.OPENROUTER_MODEL?.trim() || FREE_ROUTER;
}

/** 키가 없으면 도구는 샘플로 돌아간다 — 화면이 그 사실을 감추지 않는다. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_KEY);
}

/**
 * 한 번 호출에 기다려 줄 시간.
 *
 * `openrouter/free` 로 같은 요청을 세 번 재 보니 899초(실패) · 5.3초 · 3.9초였다.
 * 사람이 화면 앞에서 기다리는 도구라 몇 분이면 실패한 것과 같다 — 차라리 빨리 실패하고
 * 다시 하라고 말하는 편이 낫다.
 *
 * SDK 의 `timeout` 만으로는 위의 899초가 끊기지 않았다. 그래서 요청마다
 * `AbortSignal.timeout()` 을 함께 건다 — 이쪽이 확실한 문이다.
 */
const TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 60_000);

let cached: OpenAI | null = null;

function client(): OpenAI {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) throw new Error("OPENROUTER_KEY 가 없습니다.");
  cached ??= new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: TIMEOUT_MS,
    // 느려서 끊긴 것을 다시 부르면 기다리는 시간만 곱절이 된다.
    maxRetries: 0,
    // OpenRouter 대시보드에서 어느 앱이 쓴 건지 구분하기 위한 표시. 없어도 동작한다.
    defaultHeaders: { "X-Title": "ChalDduck" },
  });
  return cached;
}

/**
 * 넘으면 앞부분만 보낸다.
 *
 * 상한과 자른 사실을 화면에 알려 주는 일은 `lib/ai-limit` 가 함께 한다 — 같은 값을 두
 * 곳에 적으면 어느 한쪽이 조용히 어긋난다(예전에는 서버만 자르고 화면은 몰랐다).
 */
export function clampInput(text: string): string {
  return text.slice(0, AI_INPUT_LIMIT);
}

/** 요청마다 거는 하드 타임아웃. SDK 설정만으로는 끊기지 않는 경우가 있다. */
const deadline = () => ({ signal: AbortSignal.timeout(TIMEOUT_MS) });

/**
 * 호출이 실패했을 때 화면에 그대로 보여 줄 수 있는 오류.
 *
 * 모델 오류 원문(영어·스택)을 사용자에게 내보내지 않는다. 대신 무엇이 일어났는지만
 * 한국어로 알리고, 원인은 서버 로그에 남긴다.
 */
export class AiUnavailableError extends Error {
  constructor(message = "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

function fail(where: string, error: unknown): never {
  console.error(`[ai] ${where} 실패:`, error);

  // 제한 시간을 넘긴 것은 "고장"이 아니라 "너무 오래 걸림"이다. 사용자가 할 수 있는
  // 일이 다르므로(다시 시도 / 모델 바꾸기) 문구도 다르게 한다.
  const timedOut =
    error instanceof Error &&
    (error.name === "APIConnectionTimeoutError" ||
      error.name === "TimeoutError" ||
      error.name === "APIUserAbortError" ||
      /timeout|timed out|aborted/i.test(error.message));

  throw new AiUnavailableError(
    timedOut
      ? `AI 응답이 ${Math.round(TIMEOUT_MS / 1000)}초 안에 오지 않았습니다. 잠시 후 다시 시도해 주세요.`
      : undefined,
  );
}

/**
 * **다시 시도해도 되는 실패인가.**
 *
 * 모든 실패를 한 번 더 부르면 안 된다. 시간과 돈이 두 배로 들고, 사용자는 그만큼 더
 * 기다리면서 **같은 결과**를 받는다. 다시 시도할 만한 것은 **일시적인 것**뿐이다.
 *
 * | 실패 | 다시 부르는가 | 이유 |
 * |---|---|---|
 * | 타임아웃·연결 끊김·5xx | ✅ | 서버 쪽 일이라 곧 풀릴 수 있다 |
 * | 빈 응답·도구 호출 없음 | ✅ | 모델이 잠깐 말을 잃은 것 — 다른 모델이면 될 수 있다 |
 * | 429 (무료 한도) | ❌ | **몇 밀리초 뒤에 다시 눌러도 똑같이 막힌다.** 사용자에게 기다리라고 말하는 게 정직하다 |
 * | 400·401·403 | ❌ | 요청이나 키의 문제라 다시 해도 같다. 유료 슬러그를 썼는데 키가 없으면 여기 걸린다 |
 *
 * 판정만 하는 함수로 둔 이유: "이래서 안 된다" 를 **한 곳**에 모아 두려고. 재시도 정책이
 * 자꾸 바뀌면 호출 자리마다 조금씩 달라지고, 어느 쪽이 이유인지 아무도 모른다.
 *
 * ⚠️ **이 함수는 오류를 한국어 문구로 바꾸기 전에 불러야 한다.** `fail()` 은 모든 오류를
 * `AiUnavailableError` 로 감싸는데, 그걸 먼저하면 "일시적인 실패"와 "안 되는 실패"를
 * 구분할 정보가 사라져 **재시도가 아예 일어나지 않는다.** 그래서 각 호출 함수는 원래 오류를
 * 그대로 올리고, 문구 변환은 재시도가 끝난 뒤에 한다.
 *
 * `export` 한 이유: 이 판정은 **약속**이고 약속은 스모크가 확인해야 한다. 여기에 두면
 * "429 는 다시 시도하지 않는다" 를 읽고 믿는 것밖에 남지 않는다.
 */
export function isTransient(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 0;

  // **시간 초과를 먼저 본다.** 408(Request Timeout) 은 4xx 라 아래 규칙에 걸려 "다시 해도
  // 같다" 로 분류되는데, **그게 가장 틀린 판단**이다 — 시간 초과는 그 모델이 느렸다는 뜻이지
  // 요청이 잘못됐다는 뜻이 아니다. 다른 모델은 빠를 수 있다(실측: 같은 입력에 5.3초와
  // 899초가 나온 적이 있다).
  //
  // `abort` 도 여기에 넣는다. 우리가 직접 건 `AbortSignal.timeout()` 이 이쪽에서 터지는데,
  // 그건 "사용자가 화면을 떠났다" 가 아니라 **"그 모델이 제한 시간을 넘겼다"** 다. 그래서
  // 재시도할 가치가 있다.
  const text = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (/timeout|timed out|etimedout|abort/i.test(text)) return true;

  // 4xx 는 전부 다시 해도 같다. 429 는 특히 그렇다(무료 라우터의 한도를 이미 쓴 상태).
  if (status >= 400 && status < 500) return false;
  if (status >= 500) return true;
  // OpenAI SDK 는 429 를 `status` 대신 `code`/`type` 으로도 알려 준다.
  if (/\b429\b|rate.?limit|too many requests/i.test(text)) return false;
  // 401 은 키가 없는 것 — 유료 슬러그를 `.env` 에 넣었는데 키를 안 넣었을 때 여기 걸린다.
  if (/\b401\b|unauthorized|invalid.?api.?key/i.test(text)) return false;
  return true;
}

/**
 * 한 번만 다시 시도한다 — **다른 모델로.**
 *
 * ## 왜 모델 층에서 하나 (`runTool` 이 아니라)
 *
 * 사용자는 한 번 눌렀다. 재시도까지 한 호출로 세야 그게 **한 번**이다.
 * `runTool` 이 재시도하면 실패가 두 번으로 보여 한도 환불(0단계 1번)도 두 번 일어나고,
 * 화면에 "다시 시도 중" 도 없이 한참 서 있게 된다. 여기서 한 번에 끝내면 `runTool` 이 보는
 * 것은 "답을 받았거나, 못 받았다" 둘뿐이라 환불 규칙이 그대로 맞는다.
 *
 * ## 한 번만
 *
 * 두 번 재시도하면 실패한 호출이 두 자릿수 초를 넘게 걸리고, 그 시간 동안 사용자는 아무것도
 * 누를 수 없다. **한 번으로 부족하면 그건 재시도로 고칠 문제가 아니라 폴백 모델을 고르는
 * 문제다**(`.env` 의 `OPENROUTER_MODEL_<도구>`).
 *
 * ## `fallback` 이 null 이면 재시도하지 않는다
 *
 * 벤치가 **한 모델을 재려면** 그렇다. 측정하는 값은 "그 모델이 어떻게 하는가" 인데, 첫 모델이
 * 실패했을 때 다른 모델로 물어보면 **둘의 점수가 섞인다** — 비교가 아니다.
 */
export async function withFallback<T>(
  tool: AiToolKey,
  primary: string,
  fallback: string | null,
  run: (model: string) => Promise<T>,
): Promise<T> {
  const attempt = async (model: string, retried: boolean): Promise<T> => {
    const startedAt = Date.now();
    try {
      const value = await run(model);
      await recordCall({ tool, model, outcome: "ok", latencyMs: Date.now() - startedAt, retried });
      return value;
    } catch (error: unknown) {
      await recordCall({ tool, model, outcome: "failed", latencyMs: Date.now() - startedAt, retried });
      throw error;
    }
  };

  try {
    return await attempt(primary, false);
  } catch (error: unknown) {
    if (!fallback || fallback === primary || !isTransient(error)) {
      console.error(`[ai:${tool}] ${primary} 실패 — 다시 시도하지 않습니다:`, error);
      throw error;
    }
    console.error(`[ai:${tool}] ${primary} 실패 — ${fallback} 로 한 번 더 시도합니다:`, error);
    // `retried` 로 남긴다 — **두 시도 모두** 그렇다. 첫 줄은 "폴백이 일어났다" 는 사실이고
    // 둘째 줄은 "폴백으로 이 모델이 답했다" 는 사실이다. 첫 줄만 세면 폴백이 몇 번
    // 먹혔는지 알 수 없다.
    return attempt(fallback, true);
  }
}

/** 이 호출이 부를 모델 두 개 — 첫 번째와, 첫 것이 일시적으로 실패했을 때의 것. */
function routeOf(
  tool: AiToolKey,
  pinned: string | undefined,
): { primary: string; fallback: string | null } {
  // 벤치가 모델을 직접 고르면 그 슬러그를 **그대로** 재야 한다 — 도구 라우팅을 우회한다.
  if (pinned) return { primary: pinned, fallback: null };
  return { primary: modelFor(tool), fallback: fallbackModelFor(tool) };
}

/**
 * 한 번의 시도 결과를 **한 줄로** 남긴다(0단계 4번).
 *
 * ## 왜 여기서 남기는가
 *
 * 이 자리가 **실제로 무슨 일이 있었는지 아는 유일한 곳**이다. 지연은 여기서만 재어지고,
 * 어느 모델이 답했는지도 여기서만 안다. 성공·실패를 호출 층이 판단하면 재시도 경로
 * (`withFallback`) 안에서 일어난 일이 통째로 사라진다 — **폴백은 사용자에게 "한 번" 이지만
 * 모델에게는 두 번**이고, 어느 쪽을 세어야 하는지 여기서 정하지 않으면 두 장부가 어긋난다.
 *
 * **세는 것은 "모델을 부른 횟수"다.** 폴백으로 두 번 부르면 2 줄이 남는다. 한도는 1회지만
 * 비용과 지연은 2회분이다 — 그래서 `retried` 를 따로 남긴다(`calls` 와 한꺼번에 봐야 한다).
 *
 * ## 적지 않는다
 *
 * 입력도 결과도 아니다. 도구 · 모델 · 지연 · 결과 · 날짜 · 팀 · 팀원만 남긴다
 * (`AiUsage` 와 같은 약속, `call-stats.ts` 가 그 이유를 적어 둔다).
 *
 * ## 적히지 않아도 될 때
 *
 * - **세션 밖**(벤치·예약 작업) — 팀이 없다. `currentAiCaller()` 가 `null` 이면 조용히 넘긴다.
 *   벤치의 점수는 이 표가 아니라 벤치 자체가 담는다.
 * - **적히는 데 실패하면** — 지표가 없는 것보다 지표가 틀린 것이 나쁘다. 조용히 넘기고
 *   서버 로그에 남긴다. 이 경로가 뜨면 계측이 구멍이 난 것이고, 그건 **한도나 화면이 아니라
 *   판단을 그만두게** 만든다.
 */
async function recordCall(input: {
  tool: AiToolKey;
  model: string;
  outcome: "ok" | "failed";
  latencyMs: number;
  retried: boolean;
}): Promise<void> {
  const caller = currentAiCaller();
  if (!caller) return;
  try {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const row = await db.aiCall.create({
      data: { ...caller, tool: input.tool, model: input.model, day, outcome: input.outcome, latencyMs: input.latencyMs, retried: input.retried },
      select: { id: true },
    });
    // 거절 판정을 호출 층이 할 수 있게 행 id 를 건넨다(`markLastCallRefused`).
    noteCallWritten(row.id);
  } catch (cause: unknown) {
    console.error(`[ai:${input.tool}] 계측을 남기지 못했습니다:`, cause);
  }
}

/**
 * 글 하나를 받아 글 하나를 돌려준다(쿠션 번역기·문장 변환·읽기 순화).
 *
 * `tool` 은 **이 호출이 어느 도구인지** 다 — `modelFor` 가 여기서 모델을 고른다. 도구를
 * 빼면 라우팅이 조용히 전체 기본값으로 떨어지고, 도구별 설정이 "설정했는데 안 먹힌" 것처럼
 * 보인다(그래서 이 자리는 `tool` 을 **필수**로 받는다).
 *
 * `model` 은 **이 호출만** 다른 모델로 부를 때 쓴다. 벤치(`npm run tool:bench`·`cushion:bench`)가
 * 이 통로를 쓴다 — 같은 입력으로 나란히 재려면 그 길이 있어야 한다.
 */
export async function askText(input: {
  tool: AiToolKey;
  system: string;
  user: string;
  maxTokens?: number;
  /** 이 호출만 다른 모델로 부른다(벤치). 없으면 `modelFor(tool)`. */
  model?: string;
}): Promise<string> {
  const { primary, fallback } = routeOf(input.tool, input.model);
  try {
    return await withFallback(input.tool, primary, fallback, async (model) => {
      const completion = await client().chat.completions.create(
        {
          model,
          max_tokens: input.maxTokens ?? 1024,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: clampInput(input.user) },
          ],
        },
        deadline(),
      );

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) throw new Error("빈 응답");
      return text;
    });
  } catch (error) {
    return fail("askText", error);
  }
}

/**
 * 글 하나를 받아 글 하나를 돌려주되, **오는 동안마다** 알려 준다(쿠션 번역기·문장 변환).
 *
 * `onDelta` 로 넘어온 조각을 이어 붙인 것이 반환값이다. 즉 **완성된 글은 스트리밍을 쓰든
 * 안 쓰든 똑같다** — 스트리밍은 기다리는 동안 화면에 무엇을 보여 줄지에만 영향을 준다.
 *
 * ## 왜 `stream: true` 로 다시 부르는가 — `askText` 를 두 번 부르지 않는다
 *
 * 이 함수를 "조금씩 받아서 이어 붙여 부르기" 로 만들면 **한도·폴백·계측이 전부 두 번씩**
 * 돌아간다. 스트리밍은 **표현**의 문제지 호출 횟수의 문제가 아니다. 그래서 호출은 한 번이고,
 * 조각을 받는 동안 **지연과 계측은 열린 채로** 있다.
 *
 * ## 실패가 나면 `onDelta` 로 이미 보낸 글은 어떻게 되나
 *
 * **화면에는 그대로 남는다.** 되돌릴 방법을 코드는 모른다(모델이 이미 토큰을 보냈으므로).
 * 그래도 **한도 환불은 그대로 된다** — 실패는 `runTool` 의 `catch` 에서 보이므로, 스트리밍
 * 여부와 상관없이 한도가 돌아간다(0단계 1번). 남는 것은 "화면에 잠깐 떴다가 실패 문구로
 * 바뀌는 것" 뿐이고, 지워지는 것은 아무것도 없다.
 */
export async function askTextStreaming(input: {
  tool: AiToolKey;
  system: string;
  user: string;
  maxTokens?: number;
  /** 이 호출만 다른 모델로 부른다(벤치). 없으면 `modelFor(tool)`. */
  model?: string;
  /** 조각이 올 때마다 부른다. 화면에 곧바로 보이게 하려는 통로. */
  onDelta: (delta: string) => void;
}): Promise<string> {
  const { primary, fallback } = routeOf(input.tool, input.model);

  const attempt = async (model: string, retried: boolean): Promise<string> => {
    const startedAt = Date.now();
    let text = "";
    try {
      const stream = await client().chat.completions.create(
        {
          model,
          max_tokens: input.maxTokens ?? 1024,
          stream: true,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: clampInput(input.user) },
          ],
        },
        deadline(),
      );

      for await (const chunk of stream) {
        // **빈 조각을 그대로 넘기지 않는다.** 화면이 조각마다 상태를 갱신하므로, 내용이 없는
        // 조각(마지막에 자주 온다)이 수백 번 상태를 바꾸면 "다듬는 중" 표시가 떨린다.
        const delta = chunk.choices[0]?.delta?.content;
        if (!delta) continue;
        text += delta;
        input.onDelta(delta);
      }

      const trimmed = text.trim();
      if (!trimmed) throw new Error("빈 응답");
      await recordCall({ tool: input.tool, model, outcome: "ok", latencyMs: Date.now() - startedAt, retried });
      return trimmed;
    } catch (error: unknown) {
      await recordCall({ tool: input.tool, model, outcome: "failed", latencyMs: Date.now() - startedAt, retried });
      throw error;
    }
  };

  try {
    try {
      return await attempt(primary, false);
    } catch (error: unknown) {
      // 폴백에도 `onDelta` 를 그대로 넘긴다 — 화면은 "어느 모델의 것인지" 모르고 알 필요도 없다.
      if (!fallback || fallback === primary || !isTransient(error)) {
        console.error(`[ai:${input.tool}] ${primary} 실패 — 다시 시도하지 않습니다:`, error);
        throw error;
      }
      console.error(`[ai:${input.tool}] ${primary} 실패 — ${fallback} 로 한 번 더 시도합니다:`, error);
      return attempt(fallback, true);
    }
  } catch (error) {
    return fail("askTextStreaming", error);
  }
}

/**
 * 정해진 모양의 값을 받는다(AI 서기·발표 지원).
 *
 * 모델에게 JSON 을 "글로" 적게 하고 파싱하면 따옴표 하나에 깨진다. 대신 함수 하나를
 * 정의해 **그 함수를 부르게** 하고 인자를 받는다 — 모양은 스키마가 보증한다.
 */
export async function askShape<T>(input: {
  tool: AiToolKey;
  system: string;
  user: string;
  shapeName: string;
  shapeDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** 이 호출만 다른 모델로 부른다(벤치). 없으면 `modelFor(tool)`. */
  model?: string;
}): Promise<T> {
  const { primary, fallback } = routeOf(input.tool, input.model);
  try {
    return await withFallback(input.tool, primary, fallback, async (model) => {
      const completion = await client().chat.completions.create(
        {
          model,
          max_tokens: input.maxTokens ?? 2048,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: clampInput(input.user) },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: input.shapeName,
                description: input.shapeDescription,
                parameters: input.schema,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: input.shapeName } },
        },
        deadline(),
      );

      const message = completion.choices[0]?.message;
      const call = message?.tool_calls?.[0];
      const args = call && "function" in call ? call.function.arguments : null;

      // 1순위는 함수 인자다. 인자가 깨져 있으면(따옴표 하나에 JSON.parse 가 터진다) 그 글에서
      // 객체를 한 번 건져 본다. 2순위는 본문이다 — `tool_choice` 를 무시하고 본문에 JSON 을
      // 쏟는 모델이 많다(코드펜스·앞뒤 설명 포함). 같은 답을 받고도 통째로 실패로 치면 사용자가
      // 한도를 걸고 다시 눌러야 한다. 모양만 건지고, 내용은 `lib/ai-draft-shape.ts` 가 거른다.
      const value = extractJsonObject(args) ?? extractJsonObject(message?.content);

      // **건질 것이 없으면** shape 를 못 받은 것이다. 빈 응답과 같은 일로 친다 —
      // 다른 모델이면 함수 호출을 잘 하는 경우가 실제로 있어서, 재시도할 여지가 있다.
      if (!value) throw new Error("도구 호출이 없는 응답");

      // 필수 필드가 **전부** 빠진 응답(`{}` 등)을 성공으로 올리면 빈 초안이 "AI 결과" 로 보인다.
      // 이것도 일시적 실패로 치면 폴백 모델이 한 번 더 시도한다. 일부만 빠진 응답은 통과시킨다 —
      // 회의가 아닌 입력에서 `candidates` 를 생략하는 것은 정직한 답이고, 모양은 `lib/ai-draft-shape`
      // 가 빈 값으로 채운다.
      const missing = missingRequired(input.schema, value);
      const requiredCount = Array.isArray(input.schema.required) ? input.schema.required.length : 0;
      if (requiredCount > 0 && missing.length === requiredCount) {
        throw new Error(`필수 필드가 없는 응답: ${missing.join(", ")}`);
      }

      return value as T;
    });
  } catch (error) {
    return fail("askShape", error);
  }
}

/** 웹 검색이 붙은 호출에서 돌려주는 것 — 본문과 실제로 인용된 출처. */
export type SearchedAnswer = {
  text: string;
  /**
   * 모델이 실제로 인용한 곳. 지어낸 주소가 아니라 검색 결과에서 온 것이다.
   *
   * `excerpt` 는 OpenRouter 가 붙여 주는 **그 페이지의 실제 발췌**다. 모델이 본문을
   * 한 글자도 안 돌려주는 일이 있어(무료 모델에서 실제로 겪었다) 이것만으로도
   * 자료 카드를 만들 수 있게 같이 들고 온다.
   */
  citations: Array<{ title: string; url: string; excerpt: string }>;
};

/** OpenRouter 가 붙여 주는 출처 표시. SDK 타입에 없어 여기서만 모양을 적어 둔다. */
type UrlCitation = {
  type?: string;
  url_citation?: { url?: string; title?: string; content?: string };
};

/**
 * 웹 검색을 거쳐 답한다(AI 리서처).
 *
 * 리서처의 약속이 **"출처가 없는 결과는 보여주지 않는다"** 인데, 검색 없이 모델에게
 * 자료를 물으면 있을 법한 논문 제목과 학회지 이름을 지어낸다. 그래서 이 도구만은
 * OpenRouter 의 웹 검색 플러그인을 붙이고, 화면에는 **모델이 실제로 인용한 곳**만
 * 출처로 올린다.
 */
export async function askWithSearch(input: {
  tool: AiToolKey;
  system: string;
  user: string;
  maxResults?: number;
  /** 이 호출만 다른 모델로 부른다(벤치). 없으면 `modelFor(tool)`. */
  model?: string;
}): Promise<SearchedAnswer> {
  const { primary, fallback } = routeOf(input.tool, input.model);
  try {
    return await withFallback(input.tool, primary, fallback, async (model) => {
      const completion = await client().chat.completions.create(
        {
          model,
          max_tokens: 2048,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: clampInput(input.user) },
          ],
          // OpenAI 스키마에 없는 OpenRouter 확장이라 타입을 넓혀 넘긴다.
          plugins: [{ id: "web", max_results: input.maxResults ?? 5 }],
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
          plugins: Array<{ id: string; max_results: number }>;
        },
        deadline(),
      );

      const message = completion.choices[0]?.message;
      const annotations = (message as { annotations?: UrlCitation[] } | undefined)?.annotations ?? [];

      // 같은 페이지가 여러 번 인용돼 오므로 주소로 묶는다.
      const citations = new Map<string, { title: string; url: string; excerpt: string }>();
      for (const annotation of annotations) {
        const cite = annotation.url_citation;
        if (!cite?.url) continue;
        const seen = citations.get(cite.url);
        const excerpt = (cite.content ?? "").trim();
        if (seen) {
          // 더 긴 발췌를 남긴다 — 같은 페이지의 다른 부분이 올 수 있다.
          if (excerpt.length > seen.excerpt.length) seen.excerpt = excerpt;
          continue;
        }
        citations.set(cite.url, { title: cite.title || cite.url, url: cite.url, excerpt });
      }

      return { text: message?.content?.trim() ?? "", citations: [...citations.values()] };
    });
  } catch (error) {
    return fail("askWithSearch", error);
  }
}
