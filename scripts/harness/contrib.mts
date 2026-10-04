/**
 * 기여 의견 검사 진입점 — 드라이브·AI·가입 과 **같은 하네스**를 쓴다.
 * `assertLocalOnly` 에 버킷 확인을 넘기지 않는다 — 저장소에 손대지 않는다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

assertLocalOnly();

installRequestContext();

const { run } = await import("./contrib.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);
