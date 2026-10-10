/**
 * **한 번도 실행되지 않은 서버 액션** 목록.
 *
 * ## 왜 이게 필요한가
 *
 * 구조 검사는 **형식만** 본다. 그 형식이 틀렸으면 초록불인데 실제로는 안전하지 않다 — 오늘
 * 기여 의견 잠금이 그랬다(순서는 맞았고, 검사가 재현을 못했다).
 *
 * 더 조용한 문제가 있다. **액션이 있는지 조차 모르는 것.** 순수 규칙은 잘 테스트했는데 그것을
 * 부르는 액션 본문은 소스 텍스트로만 본다 — 순수 함수가 초록불이어도 액션이 그것을 제대로 쓰고
 * 있다는 보장이 없다. 오늘 업무 권한 네 곳이 정확히 그 상태였다.
 *
 * 이 도구는 그 상태를 **목록으로** 만든다. 다음에 무엇을 실제로 돌릴지는 눈으로 훑어 정하는 게
 * 아니라 **이 목록으로** 정한다.
 *
 * 세 종류로 나눈다 —
 *
 * | 표시 | 뜻 |
 * |---|---|
 * | **실행됨** | 어떤 검사가 실제로 부른다(액션 경계를 통과해) |
 * | **형식만** | 소스 텍스트만 본다 — 초록불이어도 행동은 검증되지 않았다 |
 * | **없음** | 어디에서도 보지 않는다 |
 *
 *   npm run audit:actions
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stripComments } from "./strip-comments.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACTIONS = join(root, "src/server/actions");
const TESTS = [
  "scripts/smoke.mts",
  "scripts/smoke-join.mts",
  "scripts/smoke-ai.mts",
  "scripts/harness/drive.integration.mts",
  "scripts/harness/ai.integration.mts",
  "scripts/harness/join.integration.mts",
  "scripts/harness/contrib.integration.mts",
  "scripts/harness/cron.integration.mts",
  "scripts/harness/tasks.integration.mts",
  "scripts/harness/meetings.integration.mts",
  "scripts/harness/roles.integration.mts",
  "scripts/harness/team.integration.mts",
  "scripts/harness/report-share.integration.mts",
  "scripts/harness/email-auth.integration.mts",
  "scripts/harness/notes.integration.mts",
  "scripts/harness/attendance.integration.mts",
  "scripts/harness/schedule.integration.mts",
];

/** 검사 파일들을 한 덩어리로 읽는다 — 호출 여부는 '어딘가에 그 이름이 있나' 다. */
const testSource = TESTS.map((f) => {
  try {
    return readFileSync(join(root, f), "utf8");
  } catch {
    return "";
  }
}).join("\n");

const rows = [];
let totalActions = 0;
let called = 0;
let shapeOnly = 0;
let unseen = 0;

for (const file of readdirSync(ACTIONS).sort()) {
  if (!file.endsWith(".ts")) continue;
  const full = join(ACTIONS, file);
  if (!statSync(full).isFile()) continue;
  const source = stripComments(readFileSync(full, "utf8"));
  // `export async function 이름(` — 서버 액션만 본다(내보낸 상수는 제외).
  const names = [...source.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g)].map(
    (m) => m[1],
  );
  if (names.length === 0) continue;

  for (const name of names) {
    totalActions += 1;
    // **실제로 부르는지** — 이름 앞에 `(` 이 오고 이름이 홀로 서 있는 모양을 찾는다.
    const invoked = new RegExp(`\\b${name}\\s*\\(`).test(
      testSource.replace(new RegExp(`readCode\\([^)]*actions/${file.replace(/\.ts$/, "")}[^)]*\\)`, "g"), ""),
    );
    // **형식만 보는지** — 그 파일을 통째로 읽어 구조를 확인하는 곳이 있는가.
    const shape = testSource.includes(`readCode("../src/server/actions/${file}"`);

    const kind = invoked ? "실행됨" : shape ? "형식만" : "없음";
    if (invoked) called += 1;
    else if (shape) shapeOnly += 1;
    else unseen += 1;
    rows.push({ file, name, kind });
  }
}

const MARK = { "실행됨": "  ", "형식만": "△", "없음": "×" };

console.log(`\n서버 액션 ${totalActions}개`);
console.log(`  실행됨 ${called} · 형식만 ${shapeOnly} · 없음 ${unseen}`);
console.log("\n△ **형식만** — 초록불이어도 행동은 검증되지 않았다. 아무도 못 봤다는 뜻이다.\n");
for (const row of rows.filter((r) => r.kind !== "실행됨")) {
  console.log(`  ${MARK[row.kind]} ${row.file.replace(/\.ts$/, "")}.${row.name}`);
}
console.log("");
console.log(`**형식만 ${shapeOnly}개 + 없음 ${unseen}개** — 초록불이어도 행동은 검증되지 않았다.`);
console.log("다음에 무엇을 실제로 돌릴지는 이 목록으로 정한다(눈으로 훑어 고르지 않는다).");
console.log("");