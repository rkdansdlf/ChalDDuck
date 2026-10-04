import { createHash, randomBytes } from "node:crypto";

/**
 * 초대 링크 토큰.
 *
 * **원문은 어디에도 저장하지 않는다.** 발급할 때 한 번만 돌려주고, DB 에는 해시만 남긴다.
 * DB 가 새어 나가도 살아 있는 초대 링크가 그대로 노출되지 않는다.
 *
 * ## 왜 sha256 인가 — scrypt 를 안 쓰는 이유
 *
 * `auth/rejoin-code.ts` 는 scrypt 를 쓴다. 그건 그 코드가 **사람이 직접 typing 하는**
 * 12자리 값이라, 해시를 느리게 만들어야 추측 비용이 올랐기 때문이다. 여기서는 다르다:
 *
 * - **256비트**라 추측이 애초에 불가능하다(2^256). 느린 KDF 는 아무것도 사지 못한다.
 * - 느려지면 요청 하나당 수십 ms 를 종종 지불하는데, 그 비용을 얻는 것이 없다.
 *
 * 그래서 해시도 **연산자가 손대지 않아도 되는 쪽**을 고른다 — 비교가 일치 여부 하나로 끝나고,
 * 타이밍을 따질 대상이 없다.
 *
 * ## 인코딩
 *
 * `base64url` — 43자, `A-Z a-z 0-9 - _` 뿐이다. 쿼리 문자열에 넣어도 인코딩이 필요 없고,
 * `+` `/` `=` 때문에 값이 깨지는 사고도 없다. 예전 `Team.code` 는 사람이 옮겨 적는 용도라
 * 헷갈리는 글자(0/O, 1/I)를 뺐지만, 이 토큰은 옮겨 적는 사람이 없다.
 */

/** 링크에 실을 원문 토큰을 새로 만든다. */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 원문 토큰을 저장할 값으로 바꾼다. */
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * 주소에서 넘어온 값을 해시하기 전에 거른다.
 *
 * **해시하기 전에 길이를 본다.** 43자(base64url 256비트)를 벗어난 값은 우리 것이 아니므로
 * DB 를 두드리기 전에 버린다 — `/join?t=` 는 인증 없는 공개 경로라, 아무 값이나 오가도
 * 조회가 일어나면 그만큼 DB 가 버틴다.
 *
 * 이 필터는 보안을 위한 것이 아니라 **비용**을 위한 것이다. `base64url` 알파벳과 길이를
 * 그대로 쓴다 — 중간에 잘라서 비교하지 않는다(일부만 맞는 값을 걸러야 할 이유가 없다).
 */
export const INVITE_TOKEN_LENGTH = 43;

/**
 * **`INVITE_TOKEN_LENGTH` 에서 만든다.** 둘을 따로 적으면 조용히 어긋난다 — 상수를 44로
 * 바꿨는데 정규식만 43인 채로 남으면 **정상 토큰을 통과하지 못하는** 필터가 된다. 이 필터는
 * DB 를 안 두드리고 버리는 문지기라(위 주석), 그게 어느 쪽으로 틀어도 아무 오류 없이
 * "초대가 안 먹힌다" 만 보인다.
 */
const BASE64URL = new RegExp(`^[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}$`);

export function looksLikeInviteToken(value: string): boolean {
  return BASE64URL.test(value);
}
