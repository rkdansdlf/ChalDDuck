import { check, finish, readCode } from "./db-test-base.mjs";
import { extractJsonObject, missingRequired } from "../src/lib/ai-json.js";
import { detectAiAnomalies } from "../src/server/ai/call-stats.js";
import { withFallback } from "../src/server/ai/model.js";
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
