#!/usr/bin/env node
/**
 * **배포가 왜 실패했는지** 알려 준다.
 *
 * ## 왜 있는가
 *
 * 2026-09-28 Vercel 이 이 프로젝트의 빌드 머신을 6회 연속 배정하지 못했다. 화면에는
 * `● Error` 와 Duration `?` 만 보이고 **빌드 로그가 한 줄도 없었다.** 업로드는 되고
 * 배포 레코드도 만들어지는데 그 다음에서 죽었기 때문이다.
 *
 * 그래서 "코드가 깨졌나, Vercel 이 막았나" 를 가르는 데 30분이 걸었다. 실제로 가른 방법은
 * 이것이었다 — 커밋을 바꿔도 같나, 환경변수를 지워도 같나, 횟수·시간이 한도에 걸렸나.
 * **판단 순서와 그때의 결과**를 여기에 적어 둔다.
 *
 * ## 읽는 법
 *
 * | deploy 가 말한 것 | 뜻 | 할 일 |
 * |---|---|---|
 * | `Resource provisioning failed` | **Vercel 이 빌드를 시작하지 못했다.** 코드는 실행되지 않았다 | 몇 분 뒤 **같은 커밋으로 다시** 시도. 되면 끝이다 |
 * | Duration 에 초 숫자가 있다 | 빌드가 **실제로 돌았다** | `npm run deploy:why` 가 빌드 로그를 보여 준다 — 그건 코드 문제다 |
 * | `Duration ?` + 로그 없음 | 위와 같다 (시작 못 함) | 지면 다시 시도해 도 된다 |
 *
 * ## 왜 "다시 시도" 가 맞나
 *
 * 같은 커밋이 몇 분 뒤에 그대로 성공했다. hobby 는 프로젝트당 **동시 빌드가 제한**되므로
 * 겹친 빌드가 원인이었고(추측 — 다른 가설은 아래 검사로 배제했다), 겹친 것은 시간이 지나면
 * 풀린다. 그래서 이 오류는 **재시도**로 끝나고, 커밋을 만지거나 되돌릴 필요가 없다.
 *
 * ## 배제한 것 (확인한 순서)
 *
 * 1. **코드** — 마지막 정상 커밋을 같은 프로젝트에 `vercel redeploy` 해도 똑같이 실패했다.
 * 2. **환경변수** — 추가했던 Gmail 변수를 지우고도 똑같이 실패했다(그래서 되돌렸다).
 * 3. **하루 배포 수** — 오늘 7건. hobby 제한에 훨씬 못 미친다.
 * 4. **빌드 분** — 오늘 빌드 7건 × 2분쯤. 역시 넉넉하다.
 *
 * billing 은 확인하지 않았다. `vercel usage` 가 "활성 구독이 없다" 고 하는데 hobby 는 원래
 * 구독이 없는 플랜이라 **그 문구는 정상에서도 난다** — 근거로 삼지 말 것.
 */
import { spawnSync } from "node:child_process";

const TEAM = process.env.VERCEL_TEAM ?? "rkdansdlfs-projects";
const DEPLOY = process.argv[2];

/** 이 프로젝트의 가장 최근 배포. */
function latest() {
  const r = spawnSync("npx", ["vercel", "ls", "--yes", "--format", "json"], { encoding: "utf8" });
  const list = JSON.parse(r.stdout || "{}").deployments ?? [];
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

const deployments = latest();
if (deployments.length === 0) {
  console.error("배포 목록을 못 읽었습니다. `npx vercel whoami` 로 로그인돼 있는지 보세요.");
  process.exit(2);
}

const target = DEPLOY ? deployments.find((d) => d.url.includes(DEPLOY) || d.uid === DEPLOY) : deployments[0];
if (!target) {
  console.error(`배포를 못 찾았습니다: ${DEPLOY}`);
  process.exit(2);
}

console.log(`\n배포: ${target.url}`);
const seconds = target.buildingAt && target.ready ? Math.round((new Date(target.ready) - new Date(target.buildingAt)) / 1000) : null;
console.log(
  `상태: ${target.state ?? "?"}   소요: ${seconds === null ? "?초 (빌드가 시작되지 않음)" : `${seconds}초`}   ` +
    `커밋: ${(target.meta?.githubCommitSha ?? "?").slice(0, 7)}`,
);
console.log(`  대시보드: https://vercel.com/${TEAM}/chalddeok\n`);

// **성공했으면 성공했다고 말한다.** 예전 판정은 로그에 빌드 흔적이 있기만 하면 "우리 쪽
// 실패" 로 끝냈고, 그래서 **성공한 배포를 실패로 보고**했다.
if (target.state === "READY") {
  console.log("  이 배포는 성공했습니다. 볼 것이 없습니다.\n");
  process.exit(0);
}

const inspect = spawnSync(
  "npx",
  ["vercel", "inspect", target.url, "--logs"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const logs = `${inspect.stdout || ""}${inspect.stderr || ""}`;
const lines = logs.split("\n").filter((l) => l.trim().length > 0);

// 1) 빌드가 시작했는가 — 로그에 빌드 명령이 남아 있다.
const started = /Running ".*build/.test(logs) || /Compiled successfully/.test(logs);

// 2) Vercel 이 스스로 남긴 거부 사유.
const provisioning = /Resource provisioning failed/.test(logs);
const errorLine = lines.find((l) => /BUILD_ERROR|Error:|error TS|Command .* exited with code/.test(l));

if (provisioning) {
  console.log("  Vercel 이 빌드를 시작하지 못했습니다 (Resource provisioning failed).");
  console.log("  → 코드는 실행되지 않았습니다. 커밋을 만지거나 되돌릴 필요가 없습니다.");
  console.log("  → 몇 분 뒤 `npx vercel --prod` 로 같은 커밋을 다시 시도하면 됩니다.");
  console.log("    hobby 는 프로젝트당 동시 빌드가 제한되므로 겹친 빌드가 원인인 경우가 많습니다.");
  console.log("\n  이 오류가 계속되면 대시보드의 빌드 사용량을 보세요:");
  console.log(`    https://vercel.com/${TEAM}/chalddeok\n`);
  process.exit(1);
}

if (!started) {
  // **소요 시간이 아예 없다는 것**이 "빌드를 시작하지 못했다" 의 신호다 — 시작했다면 몇 초든
  // 기록된다. 코드 탓인 빌드는 30~60초를 쓰고 실패한다(2026-09-28 기준).
  console.log("  빌드가 시작되지 않았습니다 — 로그가 한 줄도 없고 소요 시간도 없습니다.");
  console.log("  코드는 실행되지 않았으므로 **커밋을 만지거나 되돌릴 이유가 없습니다.**\n");
  console.log("  할 일: 몇 분 뒤 `npx vercel --prod` 로 같은 커밋을 다시 시도하세요.");
  console.log("    hobby 는 프로젝트당 동시 빌드가 제한돼 있어 겹친 빌드가 원인인 경우가 많고,");
  console.log("    시간이 지나면 풀립니다(같은 커밋이 그대로 성공한 일이 있습니다).\n");
  console.log("  그래도 계속되면 아래에서 빌드 사용량을 보세요:");
  console.log(`    https://vercel.com/${TEAM}/chalddeok\n`);
  process.exit(1);
}

// 3) 빌드가 돌았는데 실패했다 — 그건 코드다.
console.log("  빌드는 시작했습니다. 실패는 우리 쪽입니다.\n");
if (errorLine) console.log(`  ${errorLine.trim().slice(0, 300)}\n`);
console.log("  로컬에서 그대로 확인합니다:");
console.log("    npm run verify        # db:check · 마이그레이션 · 버킷 · test · build · tsc · lint\n");
console.log("  로컬이 초록불인데 여기가 빨강이면, 병렬로 편집된 내용이 푸시된 것입니다 —");
console.log("  그 경우 `git status` 로 미커밋 변경이 있는지 먼저 보세요.\n");
process.exit(1);
