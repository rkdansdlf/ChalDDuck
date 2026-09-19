import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude 호출 한 겹.
 *
 * 도구 5종이 쓰는 저수준 자리다. 프롬프트(무엇을 시킬지)는 `tools.ts` 에 있고,
 * 여기는 **어떻게 부르는지**만 안다 — 모델을 바꾸거나 공급자를 바꿀 때 고칠 곳이 한 곳이다.
 *
 * ⚠️ 이 모듈은 서버 전용이다(`server-only`). API 키가 브라우저로 나가면 안 된다.
 */

/** 쓰는 모델. 팀플 규모의 글 다듬기·요약에는 Sonnet 으로 충분하다. */
const MODEL = "claude-sonnet-5";

/** 키가 없으면 도구는 샘플로 돌아간다 — 화면이 그 사실을 감추지 않는다. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cached: Anthropic | null = null;

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 가 없습니다.");
  cached ??= new Anthropic({ apiKey });
  return cached;
}

/** 사용자가 넣는 글의 길이 상한. 팀플 회의 메모 기준이고, 넘으면 앞부분만 보낸다. */
const MAX_INPUT = 8000;

export function clampInput(text: string): string {
  return text.slice(0, MAX_INPUT);
}

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
  throw new AiUnavailableError();
}

/** 글 하나를 받아 글 하나를 돌려준다(쿠션 번역기·문장 변환). */
export async function askText(input: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  try {
    const message = await client().messages.create({
      model: MODEL,
      max_tokens: input.maxTokens ?? 1024,
      system: input.system,
      messages: [{ role: "user", content: clampInput(input.user) }],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) throw new Error("빈 응답");
    return text;
  } catch (error) {
    return fail("askText", error);
  }
}

/**
 * 정해진 모양의 값을 받는다(AI 서기·발표 지원).
 *
 * 모델에게 JSON 을 "글로" 적게 하고 파싱하면 따옴표 하나에 깨진다. 대신 도구 하나를
 * 정의해 **그 도구를 부르게** 하고 인자를 받는다 — 모양은 스키마가 보증한다.
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
    const message = await client().messages.create({
      model: MODEL,
      max_tokens: input.maxTokens ?? 2048,
      system: input.system,
      tools: [
        {
          name: input.shapeName,
          description: input.shapeDescription,
          input_schema: input.schema as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: input.shapeName },
      messages: [{ role: "user", content: clampInput(input.user) }],
    });

    const used = message.content.find((block) => block.type === "tool_use");
    if (!used) throw new Error("도구 호출이 없는 응답");
    return used.input as T;
  } catch (error) {
    return fail("askShape", error);
  }
}

/** 웹 검색이 붙은 호출에서 돌려주는 것 — 본문과 실제로 인용된 출처. */
export type SearchedAnswer = {
  text: string;
  /** 모델이 실제로 인용한 곳. 지어낸 주소가 아니라 검색 결과에서 온 것이다. */
  citations: Array<{ title: string; url: string }>;
};

/**
 * 웹 검색을 거쳐 답한다(AI 리서처).
 *
 * 리서처의 약속이 **"출처가 없는 결과는 보여주지 않는다"** 인데, 검색 없이 모델에게
 * 자료를 물으면 있을 법한 논문 제목과 학회지 이름을 지어낸다. 그래서 이 도구만은
 * 웹 검색을 붙이고, 화면에는 **모델이 실제로 인용한 곳**만 출처로 올린다.
 */
export async function askWithSearch(input: {
  system: string;
  user: string;
  maxSearches?: number;
}): Promise<SearchedAnswer> {
  try {
    const message = await client().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: input.system,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: input.maxSearches ?? 4,
        },
      ],
      messages: [{ role: "user", content: clampInput(input.user) }],
    });

    const citations = new Map<string, { title: string; url: string }>();
    let text = "";

    for (const block of message.content) {
      if (block.type !== "text") continue;
      text += block.text;
      for (const citation of block.citations ?? []) {
        if ("url" in citation && citation.url) {
          citations.set(citation.url, {
            title: ("title" in citation && citation.title) || citation.url,
            url: citation.url,
          });
        }
      }
    }

    return { text: text.trim(), citations: [...citations.values()] };
  } catch (error) {
    return fail("askWithSearch", error);
  }
}
