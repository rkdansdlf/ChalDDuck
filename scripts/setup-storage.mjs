import "dotenv/config";
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
const BUCKET = "submissions";
const MAX_BYTES = 50 * 1024 * 1024;

const client = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

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
