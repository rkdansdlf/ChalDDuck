/**
 * 기여도 이견 검사 진입점 — **기여 의견 동시성 검사와 다른 검사다.**
 *
 * `contrib.mts` 는 같은 순간에 두 사람이 달라도 하나만 붙는지(잠금)를 본다.
 * 여기는 **액션 경로로 앞선 의견이 이력에 남는지**를 본다 — 파일을 둘로 나눴으니
 * 어느 검사가 깨졌는지 바로 알 수 있다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

// 저장소를 건드리지 않는다 — 기여도 이견은 DB 행만 만든다.
assertLocalOnly();

installRequestContext();

const { run } = await import("./contrib-dispute.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);
