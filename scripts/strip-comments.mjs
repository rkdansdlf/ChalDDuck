/**
 * 소스에서 **주석만 지운** 코드를 읽는다 — 구조를 세는 검사용.
 *
 * ## 왜 있는가
 *
 * `scripts/smoke.mts` 는 화면을 실행할 수 없어 **소스 문자열에서 구조를 고정한다**
 * ("이 파일이 `findMany` 를 부르지 않는다", "모든 액션이 `requireLeader()` 를 부른다").
 * 이 방식에는 두 가지가 씌어 있다.
 *
 * 1. **주석을 센다.** 2026-09-28: `server/actions/invite.ts` 의 액션 2개가 모두 팀장 검사를
 *    하고 있었는데 검사가 실패했다. 16행 **주석**에 `requireLeader()` 라는 글자가 있어서
 *    정규식이 3개로 센 것이었다. 팀장 검사 누락이 아니라 주석을 센 것 — 그런데 이 검사는
 *    사람에게 "팀장 검사를 빼먹었다"고 말하는 검사가 아니다.
 * 2. **조용히 다른 것을 검사한다.** 같은 날 `api.ts` 의 함수를 `indexOf` 로 찾는 검사가
 *    함수를 못 찾으면 `-1` 이 되고, 그 뒤 슬라이스는 **다른 지점**이 된다. TypeScript 는
 *    이걸 잡지 못했고(테스트 코드라 컴파일은 된다) 검사는 초록불이었다.
 *
 * ## 왜 지우는 게 아니라 **공백으로 치환**하는가
 *
 * 잘라내면 `indexOf` 의 위치가 밀려서 "A 가 B 보다 먼저 온다" 류의 순서 검사가 어긋난다.
 * 주석을 같은 길이의 공백으로 바꾸면 **모든 위치가 그대로**이므로 기존 검사가 의도대로
 * 동작한다. 줄바꿈도(`\r` 포함) 남긴다.
 */

/** 지워지지 않아야 할 곳: 문자열 안의 `//` 와 정규식 리터럴. */
function scan(source, from, to, out) {
  const blank = (start, end) => {
    for (let k = start; k < end; k += 1) {
      if (source[k] !== "\n" && source[k] !== "\r") out[k] = " ";
    }
  };

  /** 줄 첫머리인가 — 그 앞에서 `//` 은 주석이 **반드시**다(정규식이 줄을 넘어갈 수 없다). */
  const atLineStart = (pos) => {
    let k = pos - 1;
    while (k >= 0 && (source[k] === " " || source[k] === "\t")) k -= 1;
    return k < 0 || source[k] === "\n" || source[k] === "\r";
  };

  /**
   * 이 위치의 `/` 가 **나눗셈이 아니라 정규식 시작**인가.
   *
   * 구분하지 않으면 `/\/\//g` 의 마지막 두 슬래시가 **줄 주석**으로 읽혀 `//g;` 가 지워진다
   * (실제로 그렇게 망가졌다). 판단은 앞 토큰을 본다 — 정규식은 연산자가 올 자리에 오는 일이
   * 별로 없고, 나눗셈은 값 뒤에 온다.
   *
   * 앞의 공백을 **넘지 않는다** — 줄마다 새로 본다. 그래야 파일 맨 앞의 `//` 이 정규식으로
   * 읽히지 않는다.
   */
  const regexAllowed = (pos) => {
    if (atLineStart(pos)) return true;
    let k = pos - 1;
    while (k >= 0 && (source[k] === " " || source[k] === "\t")) k -= 1;
    const prev = source[k];
    if ("(,=:[!&|?{}".includes(prev)) return true;
    // `return /…/`, `case /…/`, `typeof /…/` 처럼 키워드 뒤도 정규식이 온다.
    return /\b(return|case|typeof|instanceof|in|of|new|delete|void|do|else|yield|await)$/.test(
      source.slice(0, k + 1),
    );
  };

  /** 문자열·템플릿 하나를 통째로 건너뛴다. 닫히지 않으면 끝까지. */
  const skipLiteral = (pos) => {
    const quote = source[pos];
    let k = pos + 1;
    while (k < to) {
      if (source[k] === "\\") {
        k += 2;
        continue;
      }
      if (source[k] === quote) return k + 1;
      // 템플릿의 `${…}` 안은 **코드로 돌아간다** — 그 안에도 주석과 정규식이 온다.
      if (quote === "`" && source[k] === "$" && source[k + 1] === "{") {
        const close = matchBrace(k + 1);
        scan(source, k, close + 1, out);
        k = close + 1;
        continue;
      }
      k += 1;
    }
    return to;
  };

  /** `pos` 의 `{` 와 짝을 이루는 `}` 의 위치. */
  const matchBrace = (pos) => {
    let depth = 0;
    let k = pos;
    while (k < to) {
      const c = source[k];
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return k;
      } else if (c === '"' || c === "'" || c === "`") {
        k = skipLiteral(k) - 1;
      }
      k += 1;
    }
    return to - 1;
  };

  let i = from;
  while (i < to) {
    const ch = source[i];
    const next = i + 1 < to ? source[i + 1] : "";

    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipLiteral(i);
      continue;
    }

    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 || end > to ? to : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (ch === "/" && next === "/" && (atLineStart(i) || !regexAllowed(i))) {
      const nl = source.indexOf("\n", i);
      const stop = nl === -1 || nl > to ? to : nl;
      blank(i, stop);
      i = stop;
      continue;
    }

    // 정규식 리터럴 안은 건너뛴다 — 그 안의 `\/` 가 주석으로 읽히면 안 된다.
    if (ch === "/" && next !== "/" && next !== "*" && regexAllowed(i)) {
      let k = i + 1;
      let inClass = false;
      while (k < to) {
        const c = source[k];
        if (c === "\\") {
          k += 2;
          continue;
        }
        if (c === "\n") break; // 줄을 넘으면 리터럴이 아니다.
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          k += 1;
          break;
        }
        k += 1;
      }
      while (k < to && /[a-z]/.test(source[k])) k += 1; // 플래그
      i = k;
      continue;
    }

    i += 1;
  }
}

/** 블록 주석과 줄 주석을 같은 길이의 공백으로 치환한다. */
export function stripComments(source) {
  const out = source.split("");
  scan(source, 0, source.length, out);
  return out.join("");
}
