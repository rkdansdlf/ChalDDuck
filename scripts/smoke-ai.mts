import { check, finish, readCode, truthy } from "./db-test-base.mjs";
import { extractJsonObject, missingRequired } from "../src/lib/ai-json.js";
import { detectAiAnomalies } from "../src/server/ai/call-stats.js";
import { REASONING_OFF, withFallback } from "../src/server/ai/model.js";
import { isSafetyLabel } from "../src/lib/read-cushion.js";
import { estimateSpeechSeconds, formatSpeechSeconds, getSpeechPacingInfo } from "../src/lib/present-pacing.js";
import { shapePresentDraft } from "../src/lib/ai-draft-shape.js";

async function main() {
  console.log("=== AI 고도화 검증 스위트 ===");

  // 1. JSON extraction
  check("순수 JSON", extractJsonObject('{"a":1}'), { a: 1 });
  check("코드펜스 JSON", extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  check("앞뒤 설명 JSON", extractJsonObject('결과는 {"a":"x"} 입니다.'), { a: "x" });
  check("중괄호 문자열", extractJsonObject('앞 {"a":"}{"} 뒤'), { a: "}{" });
  check("배열 거부", extractJsonObject("[1,2,3]"), null);
  check("문자열 거부", extractJsonObject('"hello"'), null);
  check("숫자 거부", extractJsonObject("123"), null);
  check("불리언 거부", extractJsonObject("true"), null);
  check("비JSON 거부", extractJsonObject("일반 텍스트"), null);
  check("null 거부", extractJsonObject(null), null);
  check("공백 거부", extractJsonObject("   \n\t  "), null);
  check("깨진 JSON 거부", extractJsonObject('{"a":'), null);
  check("닫히지 않은 문자열 거부", extractJsonObject('{"a":"broken}'), null);
  check("필수 키 충족", missingRequired({ required: ["a", "b"] }, { a: 1, b: 2 }), []);
  check("필수 키 누락 알림", missingRequired({ required: ["a", "b"] }, { a: 1 }), ["b"]);
  check("required 없음", missingRequired({}, {}), []);

  // 2. Anomaly detection
  check(
    "호출 5건 미만 무시",
    detectAiAnomalies({ totalCalls: 4, failureRate: 0.5, retryRate: 0.5, slowRate: 0.5 }).warnings.length,
    0,
  );
  check(
    "실패율 20% 이상 감지",
    detectAiAnomalies({ totalCalls: 10, failureRate: 0.25, retryRate: 0, slowRate: 0 }).hasFailureSpike,
    true,
  );
  check(
    "재시도 30% 이상 감지",
    detectAiAnomalies({ totalCalls: 10, failureRate: 0, retryRate: 0.35, slowRate: 0 }).hasRetrySpike,
    true,
  );
  check(
    "지연 30% 이상 감지",
    detectAiAnomalies({ totalCalls: 10, failureRate: 0, retryRate: 0, slowRate: 0.4 }).hasHighLatency,
    true,
  );

  // 3. Fallback contract
  {
    const calls: string[] = [];
    const res = await withFallback("clerk", "model-a", "model-b", async (m) => {
      calls.push(m);
      if (m === "model-a") throw new Error("빈 응답");
      return "성공";
    });
    check("1차 일시실패 -> 폴백 1회 성공", res, "성공");
    check("호출 순서 [primary, fallback]", calls, ["model-a", "model-b"]);
  }
  {
    const calls: string[] = [];
    let caught: Error | null = null;
    try {
      await withFallback("clerk", "model-a", "model-b", async (m) => {
        calls.push(m);
        throw new Error("빈 응답");
      });
    } catch (e) {
      caught = e as Error;
    }
    check("2차 폴백 실패시 최종 예외", caught?.message, "빈 응답");
    check("정확히 2회에서 멈춤", calls, ["model-a", "model-b"]);
  }
  {
    const calls: string[] = [];
    let caught: Error | null = null;
    try {
      await withFallback("clerk", "model-a", "model-b", async (m) => {
        calls.push(m);
        const err = new Error("429 Too Many Requests");
        (err as { status?: number }).status = 429;
        throw err;
      });
    } catch (e) {
      caught = e as Error;
    }
    check("429 같은 비일시적 오류는 폴백 없이 즉시 중단", calls, ["model-a"]);
    check("429 예외 유지", caught?.message, "429 Too Many Requests");
  }

  // 3-0. 무료 라우터는 **다시 부르면 다른 모델이 답한다** — 같은 슬러그라도 폴백이 돈다.
  //
  // 실측(2026-10-12): 쿠션 번역기가 `openrouter/free` 로 가자 라우터가 가드 모델을 골랐고,
  // 폴백이 `fallback === primary` 에 막혀 한 번도 돌지 않은 채 실패했다.
  {
    const calls: string[] = [];
    const res = await withFallback(
      "cushion",
      "openrouter/free",
      "openrouter/free",
      async (m) => {
        calls.push(m);
        return calls.length === 1 ? "User Safety: unsafe" : "내일까지 자료 주실 수 있을까요?";
      },
      (text) => !isSafetyLabel(text),
    );
    check("무료 라우터는 같은 슬러그로 한 번 더 부른다", res, "내일까지 자료 주실 수 있을까요?");
    check("무료 라우터 재시도는 두 번 부른다", calls, ["openrouter/free", "openrouter/free"]);
  }
  {
    // 고정 슬러그는 같은 모델이 같은 답을 내므로 다시 부르지 않는다 — 시간만 두 배가 된다.
    const calls: string[] = [];
    try {
      await withFallback("clerk", "model-a", "model-a", async (m) => {
        calls.push(m);
        throw new Error("빈 응답");
      });
    } catch {
      // 기대한 실패다 — 아래에서 호출 횟수만 본다.
    }
    check("고정 슬러그가 같으면 다시 부르지 않는다", calls, ["model-a"]);
  }
  // 추론을 끈다 — 추론이 `max_tokens` 를 먼저 쓰면 글이 빈 채로 온다(실측 12번 중 6번).
  check("텍스트 호출은 추론을 끈다", REASONING_OFF.reasoning.effort, "none");
  {
    const model = readCode("../src/server/ai/model.ts");
    // 일반·스트리밍 두 호출이 모두 같은 설정을 쓴다 — 한쪽만 빠지면 두 길의 결과가 갈린다.
    truthy("일반 호출이 추론 끄기를 쓴다", model.includes("max_tokens: input.maxTokens ?? 1024,\n            ...REASONING_OFF,"));
    truthy("스트리밍 호출이 추론 끄기를 쓴다", model.includes("stream: true,\n          ...REASONING_OFF,"));
    truthy("재시도 판단은 한 곳(retryModelFor)에서 한다", model.split("retryModelFor(primary, fallback, error)").length === 3);
    // 스트리밍 재시도는 첫 시도의 조각을 버리고 시작해야 한다 — 아니면 두 글이 이어 붙는다.
    truthy("스트리밍 재시도 직전에 화면을 비운다", model.includes("input.onReset?.();"));
    const route = readCode("../src/app/api/ai/stream/route.ts");
    truthy("경로가 조각 비우기 프레임을 보낸다", route.includes("() => push(frame({ reset: true }))"));
    const client = readCode("../src/features/tools/ai-stream-client.ts");
    truthy("클라이언트가 비우기 프레임에서 모은 글을 버린다", client.includes("if (reset === true)") && client.includes('state.partial = "";'));
  }

  // 3-1. 결과로 쓸 수 없는 응답 — 안전 라벨 가드.
  //
  // 실측(2026-10-10): 무료 라우터가 고른 가드 모델이 `User Safety: safe` 를 돌려줬고,
  // 그 라벨이 그대로 "다듬은 말" 로 보였다. 라벨은 답이 아니므로 **실패로 돌려 폴백을 돈다.**
  {
    const calls: string[] = [];
    const res = await withFallback(
      "cushion",
      "model-a",
      "model-b",
      async (m) => {
        calls.push(m);
        return m === "model-a" ? "User Safety: safe" : "내일까지 자료 주실 수 있을까요?";
      },
      (text) => !isSafetyLabel(text),
    );
    check("라벨은 폴백을 돌린다", res, "내일까지 자료 주실 수 있을까요?");
    check("폴백이 실제로 불린다", calls, ["model-a", "model-b"]);
  }
  {
    const calls: string[] = [];
    let caught: Error | null = null;
    try {
      await withFallback(
        "cushion",
        "model-a",
        "model-b",
        async (m) => {
          calls.push(m);
          return "User Safety: safe";
        },
        (text) => !isSafetyLabel(text),
      );
    } catch (e) {
      caught = e as Error;
    }
    // **`빈 응답` 으로 뭉개면 안 된다** — 로그에서 "라벨을 받았다"와 "답이 비었다"는 다른 답이다.
    check("둘 다 라벨이면 쓸 수 없는 응답으로 실패", caught?.name, "UnusableOutputError");
    check("라벨도 두 번에서 멈춘다", calls, ["model-a", "model-b"]);
  }
  {
    // 라우터가 답했을 때 **실제 답한 모델**을 적기 위한 통로가 코드에 있는지.
    // (여기서 실행하면 세션이 없어 조용히 넘어가므로 구조로 고정한다.)
    const model = readCode("../src/server/ai/model.ts");
    truthy("라우터가 답한 모델을 기록한다", model.includes("note(completion.model)"));
    truthy("스트리밍도 조각이 알려 준 모델을 기록한다", model.includes("served = chunk.model"));
    truthy("스트리밍은 기록 전에 결과를 거른다", model.includes("if (input.usable && !input.usable(trimmed)) throw new UnusableOutputError(input.tool);"));
    const tools = readCode("../src/server/ai/tools.ts");
    truthy("쿠션 번역기가 라벨 가드를 건다", tools.includes("usable: (rewritten) => !isSafetyLabel(rewritten)"));
    truthy("문장 변환도 라벨 가드를 건다", tools.includes("usable: (converted) => !isSafetyLabel(converted)"));
  }

  // 4. Draft Redo vs Restore quota contract
  const draftHook = readCode("../src/features/tools/use-ai-draft.ts");
  check("redo는 서버 호출 강제 실행", /redo = useCallback\(\(\) => execute\(true\)/.test(draftHook), true);
  const restoreFn = draftHook.slice(draftHook.indexOf("restore = useCallback("));
  check("restore는 run()/execute() 안 부름", !restoreFn.includes("run(") && !restoreFn.includes("execute("), true);
  check("restore는 로컬 state만 갱신", restoreFn.includes("setResult(") && restoreFn.includes("setHistory("), true);

  // 5. Present Pacing & Structured Questions contract
  check("발화시간: 빈 문자열 0초", estimateSpeechSeconds(""), 0);
  check("발화시간: 공백만 0초", estimateSpeechSeconds("   \n\t "), 0);
  check("발화시간: 11음절 약 2초", estimateSpeechSeconds("가나다라마바사아자차카"), 2);
  check("발화시간: 33음절 약 6초", estimateSpeechSeconds("가나다라마바사아자차카가나다라마바사아자차카가나다라마바사아자차카"), 6);

  check("발화시간 포맷: 0초", formatSpeechSeconds(0), "0초");
  check("발화시간 포맷: 25초", formatSpeechSeconds(25), "약 25초");
  check("발화시간 포맷: 60초", formatSpeechSeconds(60), "약 1분");
  check("발화시간 포맷: 145초", formatSpeechSeconds(145), "약 2분 25초");

  const pacingInfo = getSpeechPacingInfo("안녕하세요 저희는 발표 지원 팀입니다");
  check("페이싱 정보: 음절 수(공백 제외 16자)", pacingInfo.syllables, 16);
  check("페이싱 정보: 초 계산(16/5.5 ≈ 3초)", pacingInfo.seconds, 3);
  check("페이싱 정보: 포맷 문자열", pacingInfo.formatted, "약 3초");

  // shapePresentDraft 구조화 및 모드 계약
  const shapedLegacy = shapePresentDraft({
    refined: "다듬은 대본입니다.",
    questions: ["질문 1", "질문 2"],
  }, "conversational");
  check("대본 다듬기 모드 보존", shapedLegacy.mode, "conversational");
  check("기존 문자열 질문 목록 보존", shapedLegacy.questions, ["질문 1", "질문 2"]);
  check("구조화 질문 목록 자동 변환", shapedLegacy.structuredQuestions?.length, 2);
  check("구조화 기본 카테고리는 general", shapedLegacy.structuredQuestions?.[0]?.category, "general");
  check("대본 발화시간 자동 산출", shapedLegacy.estimatedSeconds, estimateSpeechSeconds("다듬은 대본입니다."));

  const shapedStructured = shapePresentDraft({
    refined: "핵심 결론입니다.",
    questions: [
      { question: "통계 데이터 출처는 어디인가요?", category: "data", intent: "데이터 근거 확인" },
      { question: "실제 적용 시 한계점은?", category: "practical", intent: "실효성 검토" },
    ],
  }, "concise");
  check("구조화 질문 카테고리 보존", shapedStructured.structuredQuestions?.[0]?.category, "data");
  check("구조화 질문 의도 보존", shapedStructured.structuredQuestions?.[0]?.intent, "데이터 근거 확인");
  check("문자열 질문 호환 리스트 생성", shapedStructured.questions, [
    "통계 데이터 출처는 어디인가요?",
    "실제 적용 시 한계점은?",
  ]);

  // 프롬프트 및 단톡방 공유 계약
  const toolsCode = readCode("../src/server/ai/tools.ts");
  check("발표 정제 모드 3종 정의", /academic[\s\S]*conversational[\s\S]*concise/.test(toolsCode), true);
  check("답변은 적지 않고 질문만 뽑는 규칙 유지", /질문만 적고 답은.*적지 않는다/.test(toolsCode), true);

  const chatCode = readCode("../src/server/actions/chat.ts");
  check("예상 질문 단톡방 공유 액션 존재", /shareQuestionsToChat/.test(chatCode), true);

  await finish();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
