import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

import { stripComments } from "./strip-comments.mjs";

/**
 * SQL 주석을 지운다.
 *
 * ⚠️ `strip-comments.mjs` 는 **JS/TS** 도구다 — SQL 의 `--` 주석을 지우지 않는다. 그래서 옛 SQL 을
 *    인용한 **주석**이 검사(정정본에 옛 형태가 남아 있는지)를 통과시켜 버렸다(실제로 걸렸다).
 */
const stripSql = (sql) => sql.replace(/--[^\n]*/g, "");

/**
 * 마이그레이션 **경로**를 실제 Postgres 로 확인한다. 개발 DB 로는 못 한다.
 *
 * ## 왜 이런 도구가 있나 (2026-09-30)
 *
 * 다리 마이그레이션(`20260930210000_ice_legacy_vote_bridge`) 은 주석에는 "진행 중인 판의 표를
 * 되돌린다" 고 적었지만 SQL 은 이랬다.
 *
 * ```sql
 * INSERT INTO "IceSeat" ("roundId","memberId","voteForId") SELECT … FROM "IceBallot" …
 * ON CONFLICT DO NOTHING;
 * ```
 *
 * 두 가지가 틀렸다.
 *
 * 1. **조용히 아무것도 하지 않는다.** 키가 `(roundId, memberId)` 이고 그 자리는 이미 전부 있다 →
 *    모든 행이 충돌한다 → `DO NOTHING`.
 * 2. **표가 하나라도 있으면 배포가 죽는다.** Postgres 는 NOT NULL 을 **키 충돌보다 먼저** 검사한다.
 *    그래서 표가 있는 상태로 이 마이그레이션이 돌면 `role` 이 NULL 인 행을 넣으려다 23502 로 죽는다.
 *    즉 "조용히 무효" 와 "배포 실패" 가 **데이터 유무로 갈린다.**
 *
 * 당시 검사는 소스 정규식(`/FROM "IceBallot"/`)이었다 — SQL 이 표를 "읽는다" 고만 했지 **행을
 * 고치는지** 보지 않았다. 마이그레이션은 실제 DB 에 한 번씩 올려 봐야 하는 값이다.
 *
 * ## 이 도구가 확인하는 것
 *
 * ① **빈 DB** — 최초부터 최신까지 전부 적용하고 스키마와 어긋남이 없는지.
 * ② **정정 경로** — 다리가 **조용히 무효로 끝난 뒤**의 상태(표 기록은 있는데 다리 칸은 NULL,
 *    또는 지난 회차의 값이 남아 있음)를 만든 뒤 `…223000_ice_bridge_restore` 를 적용해 **실제로
 *    복구되는지** 확인한다. 스키마 어긋남도 함께 본다.
 *
 * ## 왜 ① 과 ② 만 돌아나 (역사를 다시 만들지 않는다)
 *
 * 프로덕션은 이미 `…190000` · `…210000` 을 적용 **했고**, 그 시점에 표가 0장이었다 → ② 조용히
 * 무효로 끝났다. 그래서 "표가 있는 상태에서 210000 을 다시 돌려 본다" 는 경로는 **어떤 환경에서도
 * 일어나지 않는다**. 그 재현을 하려고 하면 210000 이 P3018 로 죽어 배포를 막는다(직접 겪었다).
 * 이미 적용된 마이그레이션은 고칠 수도 없다 — 파일을 바꾸면 체크섬이 달라져 이후 `migrate deploy`
 * 가 전부 실패한다. 그래서 옛 파일은 **증거로만** 검사하고, 검증 대상은 정정본이다.
 *
 * ## 실행 조건
 *
 * **CREATEDB 권한이 있는 로컬 Postgres** 가 필요하다(스크래치 DB 를 만들고 지운다). Vercel 빌드는
 * 데이터베이스를 만들 수 없으므로 `verify` 에는 들어가지 않는다 — 손으로 돌리는 도구다.
 *
 * ```bash
 * npm run db:check:paths
 * ```
 */

const DB = process.env.PATH_CHECK_DB ?? "chalddeok_path_check";
const DB_URL = `postgresql://${process.env.PGUSER ?? "mac"}@localhost:5432/${DB}`;
const ADMIN = `postgresql://${process.env.PGUSER ?? "mac"}@localhost:5432/postgres`;
const MIGRATIONS = "prisma/migrations";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failed = 0;
const check = (what, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) console.log(`  ✓ ${what}`);
  else {
    failed += 1;
    console.log(`  ✗ ${what}\n      기대: ${b}\n      실제: ${a}`);
  }
};

const psql = (sql, quiet = false) => {
  const out = execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], { encoding: "utf8" }).trim();
  if (!quiet && out) console.log(`    ${out.split("\n").join("\n    ")}`);
  return out;
};
const admin = (sql) => execFileSync("psql", [ADMIN, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], { encoding: "utf8" });

const migrate = () =>
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: DB_URL, DIRECT_URL: DB_URL },
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });

const drift = () =>
  execFileSync("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: DB_URL, DIRECT_URL: DB_URL },
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  }).includes("No difference detected");

/** 지정한 마이그레이션 몇 개만 잠시 치워 두고 배포한다(치운 동안 그 구간을 건너뛴다). */
const stashMigrations = (names, run) => {
  const stash = `${ROOT}/.migration-stash`;
  fs.mkdirSync(stash, { recursive: true });
  const present = readdirSync(`${ROOT}/${MIGRATIONS}`);
  const moved = names.filter((n) => present.includes(n));
  for (const n of moved) fs.renameSync(`${ROOT}/${MIGRATIONS}/${n}`, `${stash}/${n}`);
  try {
    return run();
  } finally {
    for (const n of moved) fs.renameSync(`${stash}/${n}`, `${ROOT}/${MIGRATIONS}/${n}`);
    fs.rmdirSync(stash);
  }
};

const drop = () => execFileSync("psql", [ADMIN, "-tA", "-c", `DROP DATABASE IF EXISTS ${DB};`], { encoding: "utf8" });
const create = () => execFileSync("psql", [ADMIN, "-tA", "-c", `CREATE DATABASE ${DB};`], { encoding: "utf8" });

const seedRound = `
  INSERT INTO "Team" (id, name, code, course, "createdAt") VALUES ('t_up','다리 확인','CD-BRIDGE1','검증',now());
  INSERT INTO "Member" (id, "teamId", name) VALUES
    ('m1','t_up','김민준'), ('m2','t_up','이서연'), ('m3','t_up','박지호'), ('m4','t_up','최수빈');
  INSERT INTO "IceRound" (id, "teamId", "activeKey", game, phase, "voteSeq", "day", "hostId", "createdAt")
    VALUES ('r1','t_up','t_up','mafia','voting', 2, 1, 'm1', now());
  INSERT INTO "IceSeat" ("roundId","memberId",role,"voteForId") VALUES
    ('r1','m1','mafia', NULL), ('r1','m2','citizen', 'm3'), ('r1','m3','citizen', NULL), ('r1','m4','citizen', NULL);
  -- 지금 회차(seq 2)의 표 두 장. 다리 칸은 210000 이 무효로 끝나 **비어 있다.**
  INSERT INTO "IceBallot" ("roundId","seq","day","memberId","targetId","runoff") VALUES
    ('r1', 2, 1, 'm1', 'm2', true), ('r1', 2, 1, 'm3', 'm4', true);
  -- 지난 회차(seq 1)의 표도 남겨 둔다 — 다리 칸에는 그것이 남아 있는 상황을 만든다.
  INSERT INTO "IceBallot" ("roundId","seq","day","memberId","targetId","runoff") VALUES
    ('r1', 1, 1, 'm2', 'm4', false);
`;

console.log(`마이그레이션 경로 확인 (${DB})`);
drop();
try {
  /* ── ① 빈 DB ────────────────────────────────────────────── */
  console.log("\n① 빈 DB — 최초부터 최신까지");
  create();
  migrate();
  check("스키마와 어긋남이 없다", drift(), true);
  check("다리 컬럼이 있다", psql(`SELECT count(*) FROM information_schema.columns WHERE table_name='IceSeat' AND column_name='voteForId';`), "1");
  check("표 기록 테이블이 있다", psql(`SELECT count(*) FROM information_schema.tables WHERE table_name='IceBallot';`), "1");

  /* ── ② 정정 경로 ────────────────────────────────────────── */
  /**
   * 다리가 **조용히 무효로 끝난 뒤**의 상태를 만들고, 정정본이 실제로 복구하는지 본다.
   *
   * ⛔ `prisma migrate reset` 은 쓰지 않는다 — 에이전트에게 허용되지 않는 파괴적 동작이고,
   *    이 도구는 스크래치 DB 를 직접 만들었다 지운다. 재실행성은 **같은 경로를 두 번** 돌려
   *    결과가 같다는 것으로 본다.
   */
  const runRestoreScenario = () => {
    drop();
    create();
    // 정정본만 빼고 배포해, '직전까지 적용된' 상태를 만든다.
    stashMigrations(["20260930223000_ice_bridge_restore"], () => migrate());
    psql(seedRound, true);
    check("심어 둔 표", psql(`SELECT count(*) FROM "IceBallot";`), "3");
    check(
      "다리에는 지난 회차의 값만 남아 있다",
      psql(`SELECT coalesce(string_agg("memberId" || '→' || "voteForId", ' '), '(없음)') FROM "IceSeat" WHERE "voteForId" IS NOT NULL;`),
      "m2→m3",
    );
    migrate();
    return {
      restored: psql(`SELECT coalesce(string_agg("memberId" || '→' || "voteForId", ' ' ORDER BY "memberId"), '(없음)') FROM "IceSeat" WHERE "voteForId" IS NOT NULL;`),
      stale: psql(`SELECT coalesce("voteForId",'(null)') FROM "IceSeat" WHERE "memberId"='m4';`),
      orphans: psql(`SELECT count(*) FROM "IceSeat" WHERE "voteForId" IS NOT NULL AND "memberId" NOT IN (SELECT b."memberId" FROM "IceBallot" b JOIN "IceRound" r ON r.id=b."roundId" AND r."voteSeq"=b."seq" WHERE b."roundId"='r1');`),
    };
  };

  console.log("\n② 정정 경로 — 다리가 무효로 끝난 뒤의 상태에서 복구되는가");
  const once = runRestoreScenario();
  // 지난 회차(seq 1)의 표는 **복구하지 않는다** — 구버전이 보던 것은 "지금 고른 사람" 하나였고,
  // 지난 회차의 값을 되살리면 구버전이 마감할 때 그것까지 세게 된다.
  check("지금 회차의 표가 다리로 복구됐다", once.restored, "m1→m2 m3→m4");
  check("표가 없는 자리는 비워졌다", once.stale, "(null)");
  check("지난 회차의 값은 남지 않는다", once.orphans, "0");
  check("정정 후에도 스키마가 맞는다", drift(), true);

  console.log("\n③ 같은 경로를 두 번 돌려도 결과가 같다");
  const twice = runRestoreScenario();
  check("두 번째에도 똑같이 복구된다", twice, once);

  /* ── ④ 옛 파일은 이미 적용돼 있다 ────────────────────────── */
  console.log("\n④ 이미 적용된 옛 파일 — 고치면 배포가 죽는다");
  const old = stripSql(readFileSync(`${ROOT}/${MIGRATIONS}/20260930210000_ice_legacy_vote_bridge/migration.sql`, "utf8"));
  check("옛 파일은 여전히 잘못된 형태다(증거로 남긴다)", /ON CONFLICT DO NOTHING/.test(old), true);
  const fix = stripSql(readFileSync(`${ROOT}/${MIGRATIONS}/20260930223000_ice_bridge_restore/migration.sql`, "utf8"));
  check("정정본은 UPDATE … FROM 으로 고친다", /UPDATE "IceSeat" s\s+SET "voteForId" = b\."targetId"/.test(fix), true);
  check("정정본은 스스로 컬럼을 지킨다", /ADD COLUMN IF NOT EXISTS "voteForId"/.test(fix), true);
  check("정정본이 표가 없는 자리도 비운다", /SET "voteForId" = NULL/.test(fix), true);
  // ⚠️ 주석을 지우고 검사한다 — 옛 SQL 을 인용한 **주석** 때문에 통과시키는 일이 실제로 있었다.
  check("정정본에는 옛 형태가 남지 않았다", !/ON CONFLICT DO NOTHING/.test(fix), true);
} finally {
  drop();
}

console.log(failed === 0 ? "\n모두 통과" : `\n${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);