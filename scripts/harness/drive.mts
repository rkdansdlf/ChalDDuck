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

/**
 * `--if-configured` — 저장소 키가 **없는** 환경에서는 건너뛴다 (`storage:check:gate --if-configured` 와 같은 관례).
 *
 * 이 검사는 진짜 Supabase 저장소에 객체를 올렸다 지우므로 키가 없으면 돌 수 없다. 그런데 키가 없는 환경(CI, 키를
 * 복사하지 않은 worktree)마다 푸시 전 훅이 이 검사에서 항상 실패했고, 그러면 모두가 `--no-verify` 를 쓰게 되어
 * 훅 전체가 의미를 잃는다. 그래서 **키가 없을 때만, 건너뛴다고 말하고** 통과시킨다.
 *
 * - 맨 `npm run test:drive` 는 그대로 **엄격하다** — 키가 없으면 실패한다. 건너뛰고 싶다면 이 플래그를 직접 줘야 한다.
 * - 키가 **있으면** 아래의 안전문(`assertLocalOnly`: 로컬 DB·개발 버킷)을 지금처럼 통과해야 돈다. 이 플래그는
 *   그 문을 약하게 하지 않는다 — 키가 있는데 운영 버킷을 가리키는 환경은 여전히 거절된다.
 * - 판정은 앱이 쓰는 `isStorageConfigured()` 를 그대로 부른다 — 따로 적으면 "앱은 설정됐다는데 검사는 없다"가 된다.
 */
if (process.argv.includes("--if-configured")) {
  const { isStorageConfigured } = await import("../../src/server/storage/client.js");
  if (!isStorageConfigured()) {
    console.log("  - (저장소 키가 없어 건너뜀: 진짜 저장소 업로드·복원 검사 — 키가 있는 환경에서 `npm run test:drive` 로 돌린다)");
    console.log("\n건너뜀 — 저장소 키가 없어 test:drive 를 돌리지 않았습니다 (0건 통과, 0건 실패)");
    process.exit(0);
  }
}

// 팀을 만들고 저장소에 실제로 올렸다가 지운다 — 문은 `safety.mjs` 에 있다.
assertLocalOnly({ needsBucket: true });

installRequestContext();

const { run } = await import("./drive.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);