/**
 * 이메일 인증 하네스 진입점 — 나머지 하네스와 **같은 심기와 같은 문**을 쓴다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

assertLocalOnly();

/**
 * **실제 메일은 나가지 않게 한다.**
 *
 * 이 하네스는 인증번호를 **임의의 주소로 요청한다.** `.env.local` 에 나중에 메일 변수가
 * 생기면(운영 주소를 복사해 붙이는 일이 많다) 그대로 **진짜로 나간다** — 그리고 그 주소는
 * 사람이 쓰는 곳일 수 있다.
 *
 * 그래서 앱 모듈을 불러오기 **전에** 비운다. 빈 문자열은 mailer 가 "경로 없음" 으로 읽는다
 * (`mailer.ts` 의 `if (process.env.RESEND_API_KEY)`).
 */
for (const key of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY"]) {
  process.env[key] = "";
}

installRequestContext();

const { run } = await import("./email-auth.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);