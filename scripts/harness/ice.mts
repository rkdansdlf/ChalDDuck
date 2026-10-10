/**
 * 아이스브레이킹 하네스 진입점 — 나머지 하네스와 같은 심기와 같은 문을 쓴다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

assertLocalOnly();

installRequestContext();

const { run } = await import("./ice.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);
