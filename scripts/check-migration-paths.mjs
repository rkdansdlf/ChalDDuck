import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import * as fs from "node:fs";

import { stripComments } from "./strip-comments.mjs";

/**
 * 마이그레이션 **경로**를 실제 Postgres 로 확인한다. 개발 DB 로는 못 한다.
 *
 * ## 왜 이런 도구가 있나 (2026-09-30)
 *
 * 다리 마이그레이션(`20260930210000_ice_legacy_vote_bridge`) 은 이렇게 썼다.
 *
 * ```sql
 * INSERT INTO "IceSeat" ("roundId","memberId","voteForId") SELECT … ON CONFLICT DO NOTHING;
 * ```
 *
 * `IceSeat` 의 키는 `(roundId, memberId)` 이고 그 자리는 **이미 전부 있다** → 모든 행에서 키 충돌이
 * 나고 `DO NOTHING` 이 되어, 주석이 말한 "기존 표 복원" 이 **실제로는 아무것도 하지 않았다.**
 * 그런데 당시 검사는 소스 정규식(`/FROM "IceBallot"/`)이었다. SQL 이 표를 "읽는다" 고만 했지
 * **행을 고치는지** 보지 않았다.
 *
 * 마이그레이션은 스크립트에도 불문하고 **실제 DB 에 한 번씩 올려 봐야** 하는 값이다. 그래서 이 도구가
 * 생겼다 — 임시로 손으로 확인하고 버리는 것을 반복하지 않게.
 *
 * ## 무엇을 확인하는가
 *
 * 두 경로다.
 *
 * 1. **빈 DB** — 최초부터 최신까지 전부 적용하고, 스키마와 어긋남이 없는지.
 * 2. **업그레이드** — 다리 이전 상태의 DB 에 **진행 중인 마피아 판과 표 4장**을 심고 최신까지
 *    올린 뒤, ① 표가 `IceBallot` 의 `seq=1` 로 옮겨졌나 ② `voteForId` 로 **실제로 복원**됐나
 *    ③ 판이 여전히 투표가 열린 상태인가(`play` → `voting`).
 *
 * ## 실행 조건
 *
 * **CREATEDB 권한이 있는 로컬 Postgres**가 필요하다(스크래치 DB 를 만들고 지운다). 배포 CI 에서는
 * 데이터베이스를 만들 수 없으므로 `verify` 에는 넣지 않는다 — 손으로 돌리는 도구다.
 *
 * ```bash
 * npm run db:check:paths
 * ```
 */

const DB = process.env.PATH_CHECK_DB ?? "chalddeok_path_check";
const URL = `postgresql://${process.env.PGUSER ?? "mac"}@localhost:5432/${DB}`;
const ADMIN = `postgresql://${process.env.PGUSER ?? "mac"}@localhost:5432/postgres`;
const MIGRATIONS = "prisma/migrations";

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

const psql = (url, sql, quiet = false) => {
  const out = execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], { encoding: "utf8" });
  if (!quiet) out.trim().split("\n").filter(Boolean).forEach((l) => console.log(`    ${l}`));
  return out.trim();
};

const migrate = (dir) =>
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL },
    cwd: dir,
    stdio: "pipe",
    encoding: "utf8",
  });

/**
 * 마피아 계열 마이그레이션을 **전부** 치워 두고 배포해, "그 이전 상태" DB 를 만든다.
 *
 * ⚠️ **다리 하나만 치우면 안 된다.** 처음에 bridge 하나만 치웠더니, `IceBallot` 을 만들고 표를 옮기는
 *    마이그레이션(`…190000`)이 ** 데이터를 심기 전에** 적용돼서 표가 0장 옮겨지고, 다리는 마지막에
 *    적용됐다. 그 결과 경로가 실제 배포와 **다른 순서**로 굴러 조용히 다른 판정이 됐다.
 *    순서를 흉내 내려면 잘라야 할 구간이 처음부터 끝까지다.
 */
const STASH = ".ice-stash";
const withoutIceMafia = (dir) => {
  const stash = `${dir}/${STASH}`;
  execFileSync("mkdir", ["-p", stash]);
  const moved = fs
    .readdirSync(`${dir}/${MIGRATIONS}`)
    // ⛔ 빠뜨리면 안 된다: `…200000_ice_timeline` 이 `IceBallot` 을 Alter 한다. 골라 걷어 내면
    //    관계가 없는 테이블을 고치는 마이그레이션이 남아 배포가 P42P01 로 죽는다(실제로 걸렸다).
    // ⚠️ `230000` 이 아니라 **223000** 이다 — `20260930230000_role_draw_consent_one_row` 는
    //    **남의** 마이그레이션이라 걷어 내면 안 되고, 걷어 내서 그것만 빠지면 내 파일이 표가 없는
    //    상태에서 먼저 돌아간다(실제로 걸렸다).
    .filter((f) => /^20260930(150000|170000|190000|200000|210000|223000)_/.test(f))
    .map((f) => {
      execFileSync("mv", [`${dir}/${MIGRATIONS}/${f}`, `${stash}/${f}`]);
      return f;
    });
  try {
    migrate(dir);
  } finally {
    for (const f of moved) execFileSync("mv", [`${stash}/${f}`, `${dir}/${MIGRATIONS}/${f}`]);
    fs.rmdirSync(stash);
  }
};

const drop = () => psql(ADMIN, `DROP DATABASE IF EXISTS ${DB};`, true);

console.log(`마이그레이션 경로 확인 (${DB})`);
drop();
try {
  /* ── ① 빈 DB ─────────────────────────────────────────────── */
  console.log("\n① 빈 DB — 최초부터 최신까지");
  psql(ADMIN, `CREATE DATABASE ${DB};`, true);
  migrate(process.cwd());
  const drift = execFileSync("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL },
    stdio: "pipe",
    encoding: "utf8",
  });
  check("스키마와 어긋남이 없다", drift.includes("No difference detected"), true);
  check("다리 컬럼이 있다", psql(URL, `SELECT count(*) FROM information_schema.columns WHERE table_name='IceSeat' AND column_name='voteForId';`), "1");

  /* ── ② 업그레이드 ─────────────────────────────────────────── */
  console.log("\n② 업그레이드 — 진행 중인 판과 기존 표 4장을 심고 올린다");
  drop();
  psql(ADMIN, `CREATE DATABASE ${DB};`, true);
  withoutIceMafia(process.cwd());

  psql(
    URL,
    `
    INSERT INTO "Team" (id, name, code, course, "createdAt") VALUES ('t_up','업그레이드 확인','CD-PATHCK','검증',now());
    INSERT INTO "Member" (id, "teamId", name) VALUES
      ('m_up1','t_up','김민준'), ('m_up2','t_up','이서연'), ('m_up3','t_up','박지호'),
      ('m_up4','t_up','최수빈'), ('m_up5','t_up','정예진');
    INSERT INTO "IceRound" (id, "teamId", "activeKey", game, phase, "hostId", "createdAt")
      VALUES ('r_up','t_up','t_up','mafia','play','m_up1',now());
    INSERT INTO "IceSeat" ("roundId","memberId",role,"voteForId") VALUES
      ('r_up','m_up1','mafia','m_up3'), ('r_up','m_up2','police','m_up4'),
      ('r_up','m_up3','citizen','m_up4'), ('r_up','m_up4','citizen',NULL),
      ('r_up','m_up5','citizen','m_up3');
    `,
    true,
  );
  check("심어 둔 표", psql(URL, `SELECT count(*) FROM "IceSeat" WHERE "voteForId" IS NOT NULL;`), "4");

  migrate(process.cwd());

  // ① 표가 옮겨졌나
  check("표가 IceBallot seq=1 로 옮겨졌다", psql(URL, `SELECT count(*) || '/' || min("seq") FROM "IceBallot";`), "4/1");
  check("아무 표도 안 던진 자리는 줄이 없다", psql(URL, `SELECT count(*) FROM "IceBallot" WHERE "memberId"='m_up4';`), "0");
  check("투표 회차가 1 이다", psql(URL, `SELECT "voteSeq" FROM "IceRound" WHERE id='r_up';`), "1");
  check("후보가 좁혀지지 않았다", psql(URL, `SELECT coalesce(array_length("eligibleTargets",1),0) FROM "IceRound" WHERE id='r_up';`), "0");

  // ② **다리 복원이 실제로 되살렸나** — 첫 지적의 요지
  const bridge = psql(URL, `SELECT coalesce(string_agg("memberId" || '→' || "voteForId", ' ' ORDER BY "memberId"), '') FROM "IceSeat" WHERE "voteForId" IS NOT NULL;`);
  console.log(`    복원된 다리: ${bridge || "(없음)"}`);
  check("다리에 표 4장이 복원됐다", psql(URL, `SELECT count(*) FROM "IceSeat" WHERE "voteForId" IS NOT NULL;`), "4");
  check("아무 표도 안 던진 자리는 비어 있다", psql(URL, `SELECT coalesce("voteForId",'(null)') FROM "IceSeat" WHERE "memberId"='m_up4';`), "(null)");
  check("옮긴 표의 내용까지 같다", bridge, "m_up1→m_up3 m_up2→m_up4 m_up3→m_up4 m_up5→m_up3");

  // ③ 다리의 주석과 SQL이 같은 말을 하는가 — 주석만 고치고 SQL은 틀린 경우가 있었다
  // ⚠️ **주석을 지우고 본다.** 이 파일은 주석 안에 문제의 옛 SQL 을 그대로 인용한다. 주석까지
  //    검사하면 "고쳤어야 할 SQL" 을 검사하면서 옛 형태를 통과시켜 버린다(실제로 그렇게 걸렸다).
  const sql = stripComments(readFileSync(`${MIGRATIONS}/20260930223000_ice_bridge_restore/migration.sql`, "utf8"));
  check("정정 마이그레이션이 UPDATE … FROM 으로 고친다", /UPDATE "IceSeat" s\s+SET "voteForId" = b\."targetId"/.test(sql), true);
  check("ON CONFLICT DO NOTHING 으로 도망가지 않는다", !/ON CONFLICT DO NOTHING/.test(sql), true);
  check("스스로 컬럼을 지킨다", /ADD COLUMN IF NOT EXISTS "voteForId"/.test(sql), true);
  // 옛 파일은 **고칠 수 없다**(이미 적용돼 체크섬이 다르다). 정정본이 따로 있어야 한다.
  const old = stripComments(readFileSync(`${MIGRATIONS}/20260930210000_ice_legacy_vote_bridge/migration.sql`, "utf8"));
  check("정정본이 따로 있다(이 결함의 증거)", old.includes("ON CONFLICT DO NOTHING"), true);
} finally {
  // 확인용으로 남겨 둔다(직접 들여다보려면). 지우려면 KEEP_PATH_DB=1 로 두지 않는다.
  if (!process.env.KEEP_PATH_DB) drop();
}

console.log(failed === 0 ? "\n모두 통과" : `\n${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);