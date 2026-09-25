// Prisma CLI 는 Next.js 밖에서 돌기 때문에 .env 를 스스로 읽지 않는다.
// `.env.development.local`(로컬 DB)을 먼저 본다 — scripts/load-env.mjs 참고.
import "./scripts/load-env.mjs";

import { defineConfig, env } from "@prisma/config";

/**
 * Prisma 설정.
 *
 * Prisma 7 부터 연결 주소가 `schema.prisma` 가 아니라 이 파일에 있습니다.
 * 마이그레이션·introspection 같은 CLI 명령이 이 값을 씁니다.
 * 앱 런타임은 별도로 `src/server/db.ts` 에서 드라이버 어댑터를 만듭니다.
 *
 * CLI 는 `DIRECT_URL`(5432, 직결)을 씁니다. `DATABASE_URL` 은 Supabase 의
 * 트랜잭션 풀러(6543)라 prepared statement 와 DDL 잠금을 못 버텨서
 * 마이그레이션이 중간에 깨집니다 — 런타임 전용입니다.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
});
