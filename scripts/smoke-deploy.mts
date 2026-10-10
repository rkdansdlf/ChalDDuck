import { readFileSync } from "node:fs";
import { check, finish, readCode, truthy } from "./db-test-base.mjs";
import { deployPlan } from "./deploy-plan.mjs";

/**
 * 배포 — 프리뷰 빌드가 운영 DB 에 마이그레이션을 적용하지 않는다.
 *
 * 2026-10-10: 브랜치(PR #2)를 푸시하자 Vercel 프리뷰 빌드가 `prisma migrate deploy` 를 돌렸고, Preview 의
 * `DIRECT_URL` 이 운영 DB 를 가리켜서 마이그레이션 두 개가 **머지 전에 운영에 적용됐다.**
 * 이 확인이 막는 것은 두 가지다.
 *
 *   1. 결정표 — 프리뷰·개발은 건너뛰고, **운영이거나 모르겠으면 한다**(운영 배포가 마이그레이션 없이 조용히
 *      성공하는 쪽이 더 나쁘다).
 *   2. 소스 — `vercel.json` 이 맨 `prisma migrate deploy` 로 되돌아가지 못한다. 이게 없으면 이 수정은 다음
 *      편집에서 조용히 사라진다.
 *
 * 순수 함수와 소스 텍스트만 본다 — 실제 빌드를 돌리지 않는다.
 */
async function main() {
  console.log("=== 배포 계획 검증 ===");

  console.log("\n프리뷰는 운영 DB 에 마이그레이션하지 않는다");
  check("프리뷰는 건너뛴다", deployPlan({ VERCEL_ENV: "preview" }).migrate, false);
  check("개발도 건너뛴다", deployPlan({ VERCEL_ENV: "development" }).migrate, false);
  check("건너뛰는 이유를 말한다", deployPlan({ VERCEL_ENV: "preview" }).reason.includes("운영 DB"), true);

  console.log("\n운영이거나 모르겠으면 예전처럼 한다");
  check("운영은 한다", deployPlan({ VERCEL_ENV: "production" }).migrate, true);
  // 변수가 어떤 이유로 비면 **한다** — 건너뛰면 운영 배포가 마이그레이션 없이 초록불이 된다(P2022).
  check("변수가 없으면 한다", deployPlan({}).migrate, true);
  check("빈 값이어도 한다", deployPlan({ VERCEL_ENV: "" }).migrate, true);
  check("공백만 있어도 한다", deployPlan({ VERCEL_ENV: "  " }).migrate, true);
  check("모르는 값이면 한다", deployPlan({ VERCEL_ENV: "staging" }).migrate, true);
  check("대소문자가 달라도 운영 쪽으로 읽는다", deployPlan({ VERCEL_ENV: "Preview" }).migrate, true);

  console.log("\n분리된 DB 를 쓰는 프리뷰만 따로 켤 수 있다");
  check("프리뷰 + 옵트인은 한다", deployPlan({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "1" }).migrate, true);
  check("옵트인 값이 1 이 아니면 건너뛴다", deployPlan({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "true" }).migrate, false);
  check("옵트인은 운영에 영향이 없다", deployPlan({ VERCEL_ENV: "production", MIGRATE_ON_PREVIEW: "1" }).migrate, true);

  console.log("\n소스가 이 규칙을 우회하지 않는다");
  // JSON 은 주석 제거(`readCode`)를 거치지 않는다 — `$schema` 의 `https://` 가 주석으로 읽힌다.
  const vercelJson = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    buildCommand?: string;
  };
  check("빌드 명령이 계획 스크립트를 거친다", vercelJson.buildCommand, "node scripts/vercel-build.mjs");
  truthy("vercel.json 에 맨 prisma migrate deploy 가 없다", !/migrate\s+deploy/.test(JSON.stringify(vercelJson)));

  const script = readCode("./vercel-build.mjs");
  truthy("빌드 스크립트가 deployPlan 으로 결정한다", /deployPlan\(process\.env\)/.test(script));
  truthy("마이그레이션은 plan.migrate 안에서만 부른다", /if \(plan\.migrate\)\s*\{[\s\S]*?"migrate",\s*"deploy"[\s\S]*?\}/.test(script));
  // 마이그레이션 블록 밖에 migrate deploy 가 한 번 더 있으면 건너뛰는 의미가 없다.
  const outside = script.replace(/if \(plan\.migrate\)\s*\{[\s\S]*?\n\}\n/, "");
  truthy("마이그레이션 블록 밖에 migrate deploy 가 없다", !/"migrate",\s*"deploy"/.test(outside));
  truthy("db:check 도 같은 블록 안에 있다 (마이그레이션 뒤에만 의미가 있다)", /if \(plan\.migrate\)\s*\{[\s\S]*?db:check[\s\S]*?\}/.test(script));
  truthy("저장소 확인과 빌드는 프리뷰에서도 돈다", /step\("storage:check:gate"/.test(outside) && /step\("build"/.test(outside));
  truthy("마지막은 next build 가 아니라 npm run build 다", /\["run", "build"\]/.test(script) && !/next",\s*"build"/.test(script));

  await finish();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
