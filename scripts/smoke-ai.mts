import { check, finish, readCode } from "./db-test-base.mjs";
import { extractJsonObject, missingRequired } from "../src/lib/ai-json.js";
import { detectAiAnomalies } from "../src/server/ai/call-stats.js";
import { withFallback } from "../src/server/ai/model.js";

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

  await finish();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
