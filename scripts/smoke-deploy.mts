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
 *   1. 결정표 — **정확히 `production` 일 때만 쓴다**(`migrate`). 프리뷰·개발은 쓰지도 읽지도 않고, 모르는 환경은 쓰지
 *      않되 **읽기 전용 확인(`check`)은 한다** — 운영 배포에서 변수가 비었을 때 마이그레이션 없이 조용히 성공하는
 *      쪽(`P2022`)을 막는 안전망이다.
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

  check("프리뷰·개발은 읽기 확인(db:check)도 건너뛴다", [deployPlan({ VERCEL_ENV: "preview" }).check, deployPlan({ VERCEL_ENV: "development" }).check], [false, false]);

  console.log("\n운영만 쓴다 — 정확히 production 일 때");
  check("운영은 적용하고 확인한다", [deployPlan({ VERCEL_ENV: "production" }).migrate, deployPlan({ VERCEL_ENV: "production" }).check], [true, true]);
  check("앞뒤 공백은 운영으로 읽는다(대시보드에 잘못 친 공백이 운영을 조용히 건너뛰게 하지 않는다)", deployPlan({ VERCEL_ENV: " production " }).migrate, true);

  console.log("\n모르는 환경은 쓰지 않는다 — 대신 읽어서 확인한다(안전망)");
  const unknown: [string, Record<string, string | undefined>][] = [
    ["변수가 없다", {}],
    ["빈 값", { VERCEL_ENV: "" }],
    ["공백만", { VERCEL_ENV: "  " }],
    ["모르는 값(staging)", { VERCEL_ENV: "staging" }],
    ["대소문자가 다르다(Production)", { VERCEL_ENV: "Production" }],
    ["대소문자가 다르다(Preview)", { VERCEL_ENV: "Preview" }],
    ["줄임말(prod)", { VERCEL_ENV: "prod" }],
  ];
  for (const [label, env] of unknown) {
    const plan = deployPlan(env);
    check(`${label} → 적용하지 않고 확인만 한다`, [plan.migrate, plan.check], [false, true]);
  }
  truthy("모르는 환경이라는 사실을 로그에서 알려 준다(⚠️ 와 이유)", deployPlan({}).reason.includes("⚠️") && deployPlan({}).reason.includes("모른다"));
  check("옵트인(MIGRATE_ON_PREVIEW)도 모르는 환경에는 통하지 않는다", deployPlan({ VERCEL_ENV: "staging", MIGRATE_ON_PREVIEW: "1" }).migrate, false);

  console.log("\n어떤 값이 와도 — 쓰기는 production(또는 프리뷰 옵트인)뿐이고, 쓰면 반드시 읽어서 확인한다");
  const samples = ["production", "preview", "development", "", " ", "staging", "Production", "PRODUCTION", "prod", "test", "undefined", "null", "production\n", "pre view", "🙂"];
  let writesOutsideProduction = 0;
  let writeWithoutCheck = 0;
  for (const v of samples) {
    for (const opt of [undefined, "1", "true", "0"]) {
      const plan = deployPlan({ VERCEL_ENV: v, MIGRATE_ON_PREVIEW: opt });
      const isProd = v.trim() === "production";
      const isOptIn = opt === "1" && (v.trim() === "preview" || v.trim() === "development");
      if (plan.migrate && !isProd && !isOptIn) writesOutsideProduction += 1;
      if (isProd && !plan.migrate) writesOutsideProduction += 1; // 운영은 반드시 쓴다
      if (plan.migrate && !plan.check) writeWithoutCheck += 1;
    }
  }
  check("쓰기는 production(과 프리뷰·개발 옵트인)에서만 일어나고, production 은 반드시 쓴다", writesOutsideProduction, 0);
  check("쓰면 반드시 읽어서 확인한다(migrate ⇒ check)", writeWithoutCheck, 0);

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
  const migrateBlock = script.match(/if \(plan\.migrate\)\s*\{[\s\S]*?\n\}\n/)?.[0] ?? "";
  const checkBlock = script.match(/if \(plan\.check\)\s*\{[\s\S]*?\n\}\n/)?.[0] ?? "";
  truthy("마이그레이션 블록과 확인 블록이 따로 있다", migrateBlock.length > 0 && checkBlock.length > 0);
  truthy("db:check 는 plan.check 블록에만 있다(plan.migrate 에 묶이지 않아 프리뷰만 건너뛴다)", /db:check/.test(checkBlock) && !/db:check/.test(migrateBlock));
  truthy("db:check 는 migrate deploy 뒤에 있다(적용한 뒤에 확인한다)", script.indexOf('"migrate", "deploy"') !== -1 && script.indexOf("db:check") > script.indexOf('"migrate", "deploy"'));
  truthy("저장소 확인과 빌드는 프리뷰에서도 돈다", /step\("storage:check:gate"/.test(outside) && /step\("build"/.test(outside));
  truthy("마지막은 next build 가 아니라 npm run build 다", /\["run", "build"\]/.test(script) && !/next",\s*"build"/.test(script));

  await finish();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
