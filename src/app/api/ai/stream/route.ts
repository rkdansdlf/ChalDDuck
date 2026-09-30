import { runTool } from "@/server/ai/run";
import { convertSentenceStreaming, rewriteWithCushionStreaming } from "@/server/ai/tools";
import { requireSessionMember } from "@/server/session";
import type { AiToolKey } from "@/server/ai/limit";

/**
 * AI 초안을 **조각으로** 흘려보내는 길(15 쿠션 번역기 · 27 문장 변환).
 *
 * ## 왜 서버 액션이 아니라 Route Handler 인가
 *
 * 서버 액션이 `ReadableStream` 을 돌려주는 것은 동작하지만 **Next 문서에 없는 방법**이다
 * (`node_modules/next/dist/docs/` 에 없다 — 확인했다). 문서에도 없고 매번 바뀌는 API 위에
 * 사용자가 가장 자주 쓰는 두 도구를 세우는 것은 이 저장소의 방식과 맞지 않는다. Route
 * Handler 의 스트리밍은 문서에 있고, **버전 사이에 사라지지 않는다.**
 *
 * ## 한도·환불·출처는 전부 `runTool` 이 한다
 *
 * **이 파일이 직접 모델을 부르지 않는 것**이 핵심이다. 스트리밍을 하려고 별도의 문을 두면
 * 환불(0단계 1번)과 출처 판정이 이 길에서만 사라진다 — 그리고 그건 **아무도 모르게** 사라진다
 * (사용자는 그냥 "스트리밍이 안 돌아오네" 하고 기다린다). 이 저장소가 없애온 사고의 정확한
 * 모양이다.
 *
 * 그래서 이렇게 한다.
 * 1. 빈 `ReadableStream` 을 **미리** 만들고 그 controller 를 잡는다.
 * 2. `runTool` 안에 `call` 을 넘기고, `call` 안에서 모델 조각을 controller 로 밀어 넣는다.
 * 3. `runTool` 이 **끝까지** 기다린 뒤(`ok` 면 마지막 줄·`not ok` 면 오류) stream 을 닫는다.
 *
 * `runTool` 이 보는 것은 여전히 "답을 받았거나, 못 받았다" 둘뿐이라 환불이 그대로 맞는다.
 * 스트리밍은 **표현**의 문제지 **계약**의 문제가 아니다.
 *
 * ## 프로토콜 — 줄바꿈으로 나뉜 JSON 한 줄씩
 *
 * - `{"delta":"..."}` — 조각. 화면은 이걸 이어 붙여 **만드는 중** 글자를 보여 준다.
 * - `{"source":"ai"|"sample","value":"..."}` — **마지막 줄.** 화면이 최종적으로 보여 줄 글과
 *   그것이 예시인지 모델 것인지.
 * - `{"error":"..."}` — 실패. **한도는 이미 환불된 상태**다(`runTool` 의 `catch` 가 끝났음).
 *
 * ## 출처를 **마지막**에 보내는 이유 — 추측하지 않기 위해서
 *
 * 첫 조각과 함께 배지를 띄우고 싶지만, **`ai` 인지 `sample` 인지 아는 곳은 `runTool` 하나뿐**
 * 이다. 여기가 `isAiConfigured()` 를 다시 부르면 **그 판단을 두 곳에 두는 것**이고, 이
 * 저장소가 그랬을 때 바로 "예시가 AI 초안 배지 아래에 놓였다" 는 사고가 났다
 * (`server/ai/tools.ts` · `run.ts` 주석 참고).
 *
 * 그래서 여기는 **모르면 모른다고 말하고**, 화면은 조각이 오는 동안 "만드는 중" 을 보여 주다
 * 마지막 줄에서 배지를 붙인다. 배지가 한 박자 늦게 오는 것이, 글은 AI 냄새가 나는데 배지는
 * 예시라고 나오는 것보다 낫다.
 *
 * `value` 도 같이 보내는 이유: `askTextStreaming` 은 결과를 `trim()` 해 돌려주지만 조각은
 * trim 전이다. 화면이 이어 붙인 결과가 **비스트리밍일 때와 한 글자도 다르지 않게** 하려면
 * 서버가 가진 값을 마지막에 한 번 더 주는 편이 정확하다.
 */

/** 이 길로 흘려보낼 수 있는 도구. **화이트리스트다** — 임의 도구 키를 받지 않는다. */
const STREAMABLE = {
  cushion: rewriteWithCushionStreaming,
  sentence: convertSentenceStreaming,
} satisfies Partial<
  Record<AiToolKey, (text: string, variant: string, onDelta: (delta: string) => void) => Promise<string>>
>;

type StreamableTool = keyof typeof STREAMABLE;

function parseTool(value: unknown): StreamableTool | null {
  return typeof value === "string" && value in STREAMABLE ? (value as StreamableTool) : null;
}

const encoder = new TextEncoder();

/** 한 줄짜리 JSON. 줄바꿈이 없으면 브라우저가 어디까지 읽었는지 알 수 없다. */
function frame(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

export async function POST(request: Request) {
  /**
   * 팀원이 아니면 모델을 부르지 않는다.
   *
   * 스트리밍이라서 **한도가 먼저 차는 것처럼 보이는데** 사실은 애초에 한도가 아니라 권한이다.
   * 세션 확인을 스트리밍 뒤에 두면 첫 조각부터 나간다.
   */
  await requireSessionMember();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { tool: rawTool, text, variant } = (body ?? {}) as {
    tool?: unknown;
    text?: unknown;
    variant?: unknown;
  };
  const tool = parseTool(rawTool);
  if (!tool) return Response.json({ error: "이 도구는 조각으로 보내지 않습니다." }, { status: 400 });
  if (typeof text !== "string" || text.trim() === "") {
    return Response.json({ error: "원문이 비어 있습니다." }, { status: 400 });
  }

  /**
   * 컨트롤러를 **스트림 바깥에서** 잡는다.
   *
   * `call` 안에서 만들면 `runTool` 이 그 함수를 **기다리는 동안** 조각을 보낼 곳이 없다 —
   * 스트림이 만들어지기 전에 클라이언트가 받아야 할 게 생겨 순서가 뒤집힌다.
   */
  let push!: (chunk: Uint8Array) => void;
  let close!: () => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (chunk) => controller.enqueue(chunk);
      close = () => {
        try {
          controller.close();
        } catch {
          // 이미 닫혔다(클라이언트가 먼저 끊은 경우) — 또 울려도 아무 일도 없다.
        }
      };
    },
  });

  const streaming = STREAMABLE[tool];
  const result = await runTool(tool, () =>
    streaming(text, typeof variant === "string" ? variant : "", (delta) => {
      push(frame({ delta }));
    }),
  );

  if (result.ok) push(frame({ source: result.source, value: result.value }));
  else push(frame({ error: result.message }));
  close();

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // 프록시 버퍼가 차면 조각이 한꺼번에 도착한다 — 스트리밍인 척하는 것보다 나쁘다.
      "X-Accel-Buffering": "no",
    },
  });
}
