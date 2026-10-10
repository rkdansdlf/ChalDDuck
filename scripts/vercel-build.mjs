/**
 * Vercel 의 빌드 명령 (`vercel.json` 의 `buildCommand`).
 *
 * 예전에는 `prisma migrate deploy && npm run db:check && npm run storage:check:gate && npm run build`
 * 한 줄이었다. **프리뷰 빌드도 운영 DB 에 마이그레이션을 적용했기 때문에** 환경에 따라 갈리게 했다 —
 * 왜 그런지와 어느 쪽으로 막는지는 `deploy-plan.mjs` 머리말에 있다.
 *
 * 운영 경로는 예전 한 줄과 **순서까지 같다**: 마이그레이션 → 스키마 동기화 확인 → 저장소 확인 → 빌드.
 * 하나라도 실패하면 거기서 멈추고 그 종료 코드로 끝난다(`&&` 와 같다).
 *
 * ⚠️ 마지막은 `next build` 가 아니라 `npm run build` 다 — `package.json` 의 `build` 스크립트에 있는
 * `--webpack` 플래그가 배포에 닿아야 한다(README 의 "배포" 절).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { deployPlan } from "./deploy-plan.mjs";

const plan = deployPlan(process.env);
console.log(`[vercel-build] ${plan.reason}`);

// Windows 에서는 `npm` 이 `npm.cmd` 라 셸을 거쳐야 한다. Vercel(리눅스)에서는 필요 없다.
const shell = process.platform === "win32";

/** 단계 하나를 돌린다. 실패하면 그 종료 코드로 바로 끝낸다. */
function step(label, command, args) {
  console.log(`\n[vercel-build] ▶ ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`\n[vercel-build] ✗ ${label} 가 실패했습니다.`);
    process.exit(result.status ?? 1);
  }
}

if (plan.migrate) {
  // `prisma` 는 Node 로 엔트리를 직접 돈다 — 플랫폼과 상관없이 같다(`check-schema-in-sync.mjs` 와 같은 이유).
  const prismaEntry = "node_modules/prisma/build/index.js";
  if (!existsSync(prismaEntry)) {
    throw new Error("`node_modules/prisma` 가 없습니다. 의존성을 먼저 설치해 주세요.");
  }
  step("prisma migrate deploy", process.execPath, [prismaEntry, "migrate", "deploy"]);
  step("db:check", "npm", ["run", "db:check"]);
}

step("storage:check:gate", "npm", ["run", "storage:check:gate"]);
step("build", "npm", ["run", "build"]);
