/**
 * 기여도 이견 검사 진입점 — 드라이브·AI·가입과 **같은 하네스**를 쓴다.
 *
 * 다른 것은 버킷을 건드리지 않는다 — 기여도 이견은 DB 행만 만든다.
 * 문은 **쓰는 대상마다** 다르다(질문이 다르므로), 코드 공유는 그 이상이다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

// 저장소를 건드리지 않는다.
assertLocalOnly();

installRequestContext();

const { run } = await import("./contrib.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);