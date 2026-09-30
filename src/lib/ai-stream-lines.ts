/**
 * 서버가 밀어주는 조각들을 **한 줄씩** 떼어 내는 순수 계산(스트리밍 응답 해석).
 *
 * ## 왜 이것만 따로 떼어 냈나
 *
 * 스트리밍에서 **깨지기 쉬운 유일한 자리**가 여기다. 네트워크는 바이트를 나눠 보내는데:
 * - **한 줄이 여러 번에 걸쳐 올 수 있다** — "끝" 이 아직 안 왔다.
 * - **한 줄 안의 글자가 쪼개져 올 수 있다** — 한국어는 한 글자가 3바이트라, 경계에서 자르면
 *   깨진 글자가 된다. `TextDecoder` 가 중간의 bytes 를 붙여 주지만 **한 바이트씩 쪼개서
 *   디코딩해야** 한다(`{ stream: true }`). 이걸 빠뜨리면 화면에 `�` 가 낀다.
 * - **한 번에 여러 줄이 올 수 있다** — `while` 로 돌려야 뒤에 있는 줄을 놓치지 않는다.
 *
 * 이 세 가지는 **테스트하기 어렵고 망하면 조용히 망한다**(화면이 글자를 이상하게 보여도
 * "모델이 이상한 글자를 냈다" 하고 오해한다). 그래서 `fetch` 도 화면도 없이 순수 함수로
 * 두고 `npm test` 가 확인한다.
 *
 * ## 무엇을 하지 않는가
 *
 * **JSON 을 해석하지 않는다.** 라벨을 알 수 없는 줄은 그대로 통과시킨다 — 프로토콜을
 * 아는 것은 클라이언트(`ai-stream-client.ts`)의 몫이고, 여기서는 "줄로 자르는 것"만 한다.
 * (서버가 `JSON.stringify` 로 만들므로 깨진 줄은 실제로 나오지 않는다. 그래도 여기서
 * `throw` 하지 않는다 — 프로토콜 오염 한 조각이 사용자 세션 전체를 막아서는 안 된다.)
 */
export type LineSplitter = {
  /** 지금까지 모은, 아직 줄로 확정되지 않은 바이트. */
  buffer: string;
};

/** 새 splitter. 호출마다 새로 만들어야 한다 — 모듈 변수로 두면 두 호출이 섞인다. */
export function newLineSplitter(): LineSplitter {
  return { buffer: "" };
}

/**
 * 받은 바이트를 **완성된 줄들**로 바꾼다. 남은 조각은 다음 호출에 이어 붙인다.
 *
 * `decode` 는 **한 바이트씩 잘린 바이트 배열**을 받아 **글자**로 돌려주는 함수여야 한다
 * (화면에서는 `TextDecoder.decode(chunk, { stream: true })`). 깨진 글자를 만들지 않으려면
 * 이 분리가 반드시 있어야 한다.
 */
export function pushBytes(splitter: LineSplitter, bytes: Uint8Array, decode: (b: Uint8Array) => string): string[] {
  splitter.buffer += decode(bytes);
  const lines: string[] = [];
  let newline = splitter.buffer.indexOf("\n");
  while (newline !== -1) {
    const line = splitter.buffer.slice(0, newline).trim();
    splitter.buffer = splitter.buffer.slice(newline + 1);
    if (line) lines.push(line);
    newline = splitter.buffer.indexOf("\n");
  }
  return lines;
}

/** 스트림이 끝났을 때 **개행 없이 남아 있을 수 있는** 마지막 줄을 꺼낸다. */
export function flush(splitter: LineSplitter): string | null {
  const tail = splitter.buffer.trim();
  splitter.buffer = "";
  return tail === "" ? null : tail;
}
