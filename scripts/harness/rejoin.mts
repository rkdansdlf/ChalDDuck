/**
 * 재입장 검사 진입점 — 나머지 하네스와 **같은 심기와 같은 문**을 쓴다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

assertLocalOnly();

/**
 * **실제 메일은 나가지 않게 한다.** 이메일 재입장 검사는 인증번호를 임의의 주소로 요청한다.
 * `.env.local` 에 메일 변수가 있으면 그대로 나가므로, 앱 모듈을 불러오기 전에 비운다
 * (`email-auth.mts` 와 같은 이유·같은 방법). 빈 값이면 발송 경로가 없다고 읽고, 개발 정책이
 * 인증번호를 화면으로 돌려준다 — 그 값으로 검사한다.
 */
for (const key of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY"]) {
  process.env[key] = "";
}

installRequestContext();

const { run } = await import("./rejoin.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);
