import "server-only";

import OpenAI from "openai";

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
 * 품질이 필요해지면 `.env` 의 `OPENROUTER_MODEL` 만 바꾼다(예: anthropic/claude-sonnet-5).
 */
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

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

/** 사용자가 넣는 글의 길이 상한. 팀플 회의 메모 기준이고, 넘으면 앞부분만 보낸다. */
const MAX_INPUT = 8000;

export function clampInput(text: string): string {
  return text.slice(0, MAX_INPUT);
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

/** 글 하나를 받아 글 하나를 돌려준다(쿠션 번역기·문장 변환). */
export async function askText(input: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  try {
    const completion = await client().chat.completions.create(
      {
        model: MODEL,
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
  } catch (error) {
    return fail("askText", error);
  }
}

/**
 * 정해진 모양의 값을 받는다(AI 서기·발표 지원).
 *
 * 모델에게 JSON 을 "글로" 적게 하고 파싱하면 따옴표 하나에 깨진다. 대신 함수 하나를
 * 정의해 **그 함수를 부르게** 하고 인자를 받는다 — 모양은 스키마가 보증한다.
 */
export async function askShape<T>(input: {
  system: string;
  user: string;
  shapeName: string;
  shapeDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  try {
    const completion = await client().chat.completions.create(
      {
        model: MODEL,
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

    const call = completion.choices[0]?.message?.tool_calls?.[0];
    const args = call && "function" in call ? call.function.arguments : null;
    if (!args) throw new Error("도구 호출이 없는 응답");
    return JSON.parse(args) as T;
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
  system: string;
  user: string;
  maxResults?: number;
}): Promise<SearchedAnswer> {
  try {
    const completion = await client().chat.completions.create(
      {
        model: MODEL,
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
  } catch (error) {
    return fail("askWithSearch", error);
  }
}
