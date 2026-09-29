import "./load-env.mjs";

import pg from "pg";

/**
 * 제출 파일 버킷을 만든다. 여러 번 돌려도 같다.
 *
 * Prisma 마이그레이션에 넣지 않는 이유: Prisma 는 `public` 스키마를 관리하는데
 * 버킷은 `storage` 스키마에 있다. 마이그레이션에 섞으면 `prisma migrate diff` 가
 * 매번 되돌리려 든다.
 *
 * 버킷은 **비공개**다. 이 앱은 Supabase Auth 를 쓰지 않아 저장소 RLS 가 판단할
 * 사용자가 없으므로, 접근 권한은 앱이 서버에서 직접 확인하고 내려받기는 서명된
 * 주소로만 내준다.
 */
// 버킷 이름은 환경변수로 overridable — 로컬 개발이 운영 버킷에 쓰지 않게 하기 위해서다.
// 기본값은 배포본과 같다. `server/storage/client.ts` 의 `BUCKET` 과 같은 규칙이다 —
// 여기만 다르면 "확인은 통과하는데 저장은 다른 버킷에" 같은 상태가 된다.
const BUCKET = process.env.SUBMISSIONS_BUCKET || "submissions";
const MAX_BYTES = 50 * 1024 * 1024;

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL 이 없습니다. `.env.example` 을 참고해 채워 주세요.");
}

// 버킷 만들기는 로컬 DB 를 고치는 일이다. `.env` 만 읽으면 `next dev` 는 로컬 DB 를
// 보는데 이 명령은 운영 DB 에 버킷을 만들러 간다 — 시드와 같은 이유로 막아 둔다.
const host = new URL(connectionString).hostname;
// 로컬 Postgres 는 SSL 을 받지 않는다 — 항상 붙이면 로컬에서 Prepare 가 실패한다.
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
if (!isLocal && process.env.ALLOW_REMOTE_SEED !== "1") {
  throw new Error(
    `버킷 준비가 로컬이 아닌 DB(${host})를 가리킵니다. 정말 그곳에 만들려면 ALLOW_REMOTE_SEED=1 을 붙여 실행하세요.`,
  );
}

const client = new pg.Client({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
await client.connect();

// 저장소는 Supabase 가 관리하는 `storage` 스키마에 있다. 로컬 Postgres 는 그 스키마가
// 없어서 여기서 실패한다 — 원인을 알 수 없으면 "무슨 일이 일어났지"가 된다.
const { rows: hasStorage } = await client.query(
  `select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets'`,
);
if (hasStorage.length === 0) {
  throw new Error(
    `${host} 에는 Supabase 저장소(storage.buckets)가 없습니다. 이 명령은 Supabase 프로젝트에 대해서만 뜻이 있습니다.`,
  );
}

await client.query(
  `insert into storage.buckets (id, name, public, file_size_limit)
   values ($1, $1, false, $2)
   on conflict (id) do update set public = false, file_size_limit = $2`,
  [BUCKET, MAX_BYTES],
);

const { rows } = await client.query(
  `select id, public, file_size_limit from storage.buckets where id = $1`,
  [BUCKET],
);
console.log("버킷 준비 완료:", rows[0]);
await client.end();
