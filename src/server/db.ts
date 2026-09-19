import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";

/**
 * 앱 런타임의 Prisma 클라이언트.
 *
 * 마이그레이션(`prisma.config.ts`)과 달리 여기서는 `DATABASE_URL` — Supabase 의
 * 트랜잭션 풀러(6543) — 를 씁니다. 서버리스에서는 인스턴스가 계속 새로 뜨는데
 * 직결 주소로는 Postgres 연결 수가 금방 바닥나기 때문입니다.
 *
 * 개발 서버는 파일을 고칠 때마다 모듈을 다시 불러오므로, 전역에 하나만 두지 않으면
 * 새로 고칠 때마다 커넥션 풀이 하나씩 쌓입니다.
 *
 * **연결은 처음 질의할 때 만듭니다.** 모듈을 불러오는 순간 만들면 빌드 중
 * 페이지 정보를 모을 때도 데이터베이스가 떠 있어야 하는데, 정적 설정만 읽는 화면까지
 * 거기서 막힙니다.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL 이 없습니다. `.env.example` 을 참고해 Supabase 연결 주소를 채우세요.",
    );
  }

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/**
 * 실제로 질의가 일어날 때까지 클라이언트를 만들지 않는 얇은 프록시.
 * 쓰는 쪽에서는 그냥 `db.member.findMany(...)` 처럼 쓰면 된다.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = globalForPrisma.prisma ?? createClient();
    return Reflect.get(client, property, receiver);
  },
});
