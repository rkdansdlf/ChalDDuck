/**
 * 채팅 하네스 진입점 — 나머지 하네스와 같은 심기와 같은 문을 쓴다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly, withoutStorage } from "./safety.mjs";

assertLocalOnly();
// 첨부는 경로만 만든다 — 저장소 키가 있어도 실제 저장소에 닿지 않게 한다(없는 객체의 서명 URL 은 404 다).
withoutStorage();

installRequestContext();

const { run } = await import("./chat.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);
