/**
 * 모델이 돌려준 글에서 **구조화된 값**을 건져 내는 규칙.
 *
 * `server-only` 가 아닌 이유는 `ai-draft-shape.ts` 와 같다 — 이건 모델이 아니라 **코드가 지키는
 * 약속**이라 스모크가 모델을 부르지 않고 확인할 수 있어야 한다.
 *
 * ## 왜 필요한가
 *
 * 서기·발표는 함수 호출(`tool_choice`)로 모양을 받는다. 그런데 무료 모델 상당수가 `tool_choice`
 * 를 **무시하고 본문에 JSON 을 쏟아낸다**(코드펜스로 감싸거나 앞뒤에 설명을 붙여서). 그 응답을
 * 통째로 실패로 치면 같은 답을 받고도 사용자가 한도를 걸고 다시 눌러야 한다.
 *
 * ⚠️ 여기서 건지는 것은 **모양**뿐이다. 담당자 추측 같은 내용의 문제는 이 함수가 못 막고,
 * 그건 `ai-draft-shape.ts` 와 벤치의 일이다.
 */

/** 문자열에서 첫 번째 **균형 잡힌** `{…}` 구간을 찾는다. 문자열 리터럴 안의 중괄호는 세지 않는다. */
function firstObjectSlice(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 글 속에서 JSON 객체 하나를 꺼낸다. 못 꺼내면 `null`.
 *
 * 순서: ① 통째로 파싱 → ② 코드펜스 안 → ③ 첫 `{…}` 구간.
 * 객체가 아닌 값(배열·문자열·숫자)은 받지 않는다 — 우리가 기다리는 것은 항상 객체다.
 */
export function extractJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  const source = (text ?? "").trim();
  if (source === "") return null;

  const candidates = [source];
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const slice = firstObjectSlice(source);
  if (slice) candidates.push(slice);

  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // 다음 후보로.
    }
  }
  return null;
}

/**
 * 스키마의 `required` 키가 값에 **모두 있는가.**
 *
 * 모델이 함수는 불렀는데 인자가 `{}` 이거나 필드가 빠진 경우를 걸러, 빈 초안이 "성공" 으로
 * 화면에 올라가는 것을 막는다. 있고 없고만 본다(타입·내용은 보지 않는다).
 */
export function missingRequired(schema: Record<string, unknown>, value: Record<string, unknown>): string[] {
  const required = Array.isArray(schema.required) ? (schema.required as unknown[]) : [];
  return required.filter((key): key is string => typeof key === "string" && !(key in value));
}
