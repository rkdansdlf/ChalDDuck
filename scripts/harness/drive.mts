/**
 * 하네스 진입점 — 앱 모듈을 **불러오기 전에** 요청 컨텍스트를 심는다.
 *
 * 순서가 전부다: 심는 코드가 먼저 평가되어야 그 자리에 스텁이 들어가고, 그 뒤에 불러온
 * 앱 모듈이 그 자리를 본다. 그래서 검사 본체를 `import` 로 정적 가져오지 않고
 * `await import()` 로 늦춘다 — 정적 가져오면 이 파일보다 먼저 평가되어 심기 전에 적재된다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

// 팀을 만들고 저장소에 실제로 올렸다가 지운다 — 문은 `safety.mjs` 에 있다.
assertLocalOnly({ needsBucket: true });

installRequestContext();

const { run } = await import("./drive.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);