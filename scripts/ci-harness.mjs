#!/usr/bin/env node
/**
 * **하네스 전체를 돌리는 하나의 문** — 로컬(`verify:code`)·푸시 전 훅·CI 가 같은 목록을 쓴다.
 *
 *   node scripts/ci-harness.mjs                  # 전부 (drive 제외)
 *   node scripts/ci-harness.mjs --list           # 도는 하네스 이름만
 *   node scripts/ci-harness.mjs --check          # 목록이 빠짐없는지만 본다 (DB 를 쓰지 않는다)
 *
 * ## 왜 있는가 — 2026-10-11
 *
 * CI 는 하네스를 하나도 돌리지 않았다. 그래서 `main` 에 **어느 트리에서도 통과할 수 없는 검사 네 개**가 들어와도
 * 아무도 몰랐고(합쳐 본 뒤에야 드러났다), "감사 100% 검증"이라는 말은 액션 이름이 테스트 소스에 *나오는지*만
 * 세는 것이었다. 푸시 전 훅(`npm run verify`)은 반대쪽에서 같은 문제를 겪었다 — 저장소 키가 없는 환경에서는
 * `test:drive` 가 항상 실패해서 모두가 `--no-verify` 를 쓰게 됐고, 그러면 훅 전체가 의미를 잃는다.
 *
 * ## 목록을 손으로 적지 않는 이유
 *
 * 하네스를 만들고 목록에 넣는 것을 잊으면 그 하네스는 **조용히 안 돈다** — 이 도구가 막으려는 바로 그 일이다.
 * 그래서 목록은 `package.json` 의 `test:*` 스크립트(= `scripts/harness/*.mts` 를 부르는 것)에서 **도출한다.**
 * 새 하네스는 스크립트를 달기만 하면 자동으로 로컬·훅·CI 에 들어간다. 빠질 수 있는 길은 두 가지뿐이고 둘 다
 * 소리가 난다 — 아래 `EXCLUDED`(이유를 적는다), 그리고 `--check` 가 잡는 "진입점은 있는데 스크립트가 없다".
 *
 * ## 한 하네스가 깨져도 나머지는 돈다
 *
 * `&&` 로 이으면 앞이 깨질 때 뒤는 아예 안 돈다 — 무엇이 몇 개 깨졌는지 한 번에 알 수 없다. 여기서는 전부 돌고
 * 마지막에 표로 말하며, 하나라도 깨졌으면 1 로 끝난다. 깨진 하네스의 출력은 끝부분을 그대로 보여 준다.
 *
 * ## "건너뜀" 은 숨기지 않는다
 *
 * 저장소 키가 없어 건너뛰는 검사는 `  - (...건너뜀...)` 로 출력한다. 요약 표가 하네스마다 건너뛴 수를 센다 —
 * 조용히 통과시키면 안 본 것을 본 것처럼 보인다.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 이 도구가 돌리지 **않는** 하네스. 이유가 없으면 여기 넣지 못한다.
 * (`test:drive` 는 `verify` 가 `--if-configured` 로 따로 부른다 — 키가 있는 환경에서만 진짜로 돈다.)
 */
const EXCLUDED = {
  drive: "진짜 Supabase 저장소 키가 필요하다 — `verify` 는 `test:drive -- --if-configured` 로 따로 부른다",
  "drive:probe": "손으로 돌리는 탐침이다 — 검사가 아니라 서버 액션 경계가 열리는지 보는 도구",
};

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** `test:<이름>` 중 `scripts/harness/` 를 부르는 것 — 이름순. */
function derive() {
  return Object.entries(pkg.scripts)
    .filter(([key, cmd]) => key.startsWith("test:") && String(cmd).includes("scripts/harness/"))
    .map(([key]) => key.slice("test:".length))
    .sort();
}

/** 진입점이 있는데 `package.json` 에 스크립트가 없는 하네스 — 만들어 놓고 안 도는 것. */
function orphans() {
  const dir = join(root, "scripts/harness");
  const wired = new Set(
    Object.values(pkg.scripts)
      .map((cmd) => /scripts\/harness\/([\w-]+)\.mts/.exec(String(cmd))?.[1])
      .filter(Boolean),
  );
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mts") && !f.endsWith(".integration.mts"))
    .map((f) => f.replace(/\.mts$/, ""))
    .filter((name) => !wired.has(name));
}

/** 진입점은 `X.mts` 인데 `X.integration.mts` 가 없는 경우 — 진입점이 불러올 것이 없다. */
function missingBodies() {
  const dir = join(root, "scripts/harness");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mts") && !f.endsWith(".integration.mts"))
    .map((f) => f.replace(/\.mts$/, ""))
    .filter((name) => !existsSync(join(dir, `${name}.integration.mts`)) && name !== "probe");
}

const args = process.argv.slice(2);
const all = derive();
const runnable = all.filter((name) => !(name in EXCLUDED));

if (args.includes("--list")) {
  console.log(runnable.join("\n"));
  process.exit(0);
}

if (args.includes("--check")) {
  const problems = [];
  const loose = orphans();
  if (loose.length) {
    problems.push(
      `진입점은 있는데 package.json 에 \`test:*\` 스크립트가 없다 (만들어 놓고 안 도는 하네스): ${loose.join(", ")}`,
    );
  }
  const bodiless = missingBodies();
  if (bodiless.length) problems.push(`\`.integration.mts\` 본체가 없는 진입점: ${bodiless.join(", ")}`);
  const unknown = Object.keys(EXCLUDED).filter((name) => !all.includes(name));
  if (unknown.length) {
    problems.push(`EXCLUDED 에 있는데 package.json 에 없는 이름 (오래된 항목): ${unknown.join(", ")}`);
  }
  if (problems.length) {
    console.error("[ci-harness] ✗ 하네스 목록이 어긋났습니다:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `[ci-harness] ✓ 하네스 ${all.length}개 중 ${runnable.length}개가 돌고, ${all.length - runnable.length}개는 이유와 함께 빠져 있다.`,
  );
  for (const [name, why] of Object.entries(EXCLUDED)) console.log(`  · ${name}: ${why}`);
  process.exit(0);
}

const names = runnable;

if (names.length === 0) {
  console.log("[ci-harness] 돌릴 하네스가 없습니다.");
  process.exit(0);
}

// ── 돌리기 ───────────────────────────────────────────────
const shell = process.platform === "win32"; // `npm` 이 `npm.cmd` 라 셸을 거쳐야 한다
const inActions = process.env.GITHUB_ACTIONS === "true";
const results = [];

for (const name of names) {
  const started = Date.now();
  if (inActions) console.log(`::group::test:${name}`);
  const run = spawnSync("npm", ["run", `test:${name}`], {
    cwd: root,
    encoding: "utf8",
    shell,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const seconds = (Date.now() - started) / 1000;

  // 마지막 요약 줄: `모두 통과 — 51건 ...` / `실패 — ...` / `3건 실패 / 40건 중`.
  const summary = [...out.matchAll(/^.*(?:모두 통과|실패 —|건 실패 \/).*$/gm)].at(-1)?.[0]?.trim() ?? "(요약 줄 없음)";
  const skipped = (out.match(/^\s+- \(.*건너뜀/gm) ?? []).length;
  const ok = run.status === 0;
  results.push({ name, ok, seconds, summary, skipped });

  console.log(`${ok ? "✓" : "✗"} test:${name}  ${seconds.toFixed(1)}s  ${summary}${skipped ? `  [건너뜀 ${skipped}]` : ""}`);
  if (!ok) {
    // 깨진 하네스는 끝부분을 그대로 보여 준다 — 로그를 다시 돌려 볼 필요가 없게.
    console.log(out.split("\n").slice(-60).join("\n"));
    if (run.error) console.log(String(run.error));
  }
  if (inActions) console.log("::endgroup::");
}

// ── 요약 ─────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
const total = results.reduce((s, r) => s + r.seconds, 0);
const skippedTotal = results.reduce((s, r) => s + r.skipped, 0);
console.log("\n[ci-harness] 요약");
for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name.padEnd(16)} ${r.seconds.toFixed(1).padStart(6)}s`);
console.log(
  `  합계 ${total.toFixed(0)}s · ${results.length - failed.length}/${results.length} 통과` +
    (skippedTotal ? ` · 건너뛴 검사 ${skippedTotal}건 (저장소 키가 없는 환경)` : ""),
);
if (failed.length) {
  console.error(`\n[ci-harness] ✗ 실패한 하네스 ${failed.length}개: ${failed.map((r) => r.name).join(", ")}`);
  process.exit(1);
}
