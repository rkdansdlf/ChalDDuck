import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

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

/**
 * 다시 시도해도 되는 오류.
 *
 * 둘 다 **질의가 서버에 닿기 전에** 끝난 경우다 — 연결을 만들지 못했거나(P1001),
 * 풀에서 연결을 받지 못했거나(P2024). 아무것도 실행되지 않았으니 쓰기여도 다시
 * 보내는 것이 안전하다.
 *
 * P1017("서버가 연결을 닫음")은 일부러 뺐다. 질의를 보낸 뒤에 끊겼을 수도 있어,
 * 다시 보내면 기여 기록이 두 번 쌓이는 식의 사고가 난다.
 */
const RETRYABLE = new Set(["P1001", "P2024"]);

/** 다시 시도하는 간격. 순간적인 네트워크 끊김을 넘기기 위한 것이라 짧게 둔다. */
const BACKOFF_MS = [250, 750];

function codeOf(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 연결이 순간적으로 끊긴 경우에만 다시 시도한다.
 *
 * 오래 놀던 서버가 첫 질의에서 P1001 로 터지는 일을 개발 중에 두 번 겪었다.
 * 사용자는 새로고침 한 번이면 되는 일이지만, 화면에 빨간 오류가 뜨는 것과
 * 0.25초 늦게 제대로 뜨는 것은 다르다.
 */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const code = codeOf(error);
      if (!code || !RETRYABLE.has(code) || attempt >= BACKOFF_MS.length) throw error;

      console.warn(`[db] ${code} — ${BACKOFF_MS[attempt]}ms 뒤에 다시 시도합니다.`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL 이 없습니다. `.env.example` 을 참고해 Supabase 연결 주소를 채우세요.",
    );
  }

  /**
   * 커넥션 풀을 직접 만든다.
   *
   * 어댑터에 주소 문자열만 넘기면 기본값으로 풀이 만들어지는데, 그러면 두 가지를
   * 할 수 없다 — 쉬고 있던 연결이 끊겼을 때 받아 주는 것과, 기다릴 시간을 정하는 것.
   */
  const pool = new Pool({
    connectionString: url,
    // 트랜잭션 풀러 뒤라 앱이 연결을 많이 쥐고 있을 이유가 없다.
    max: 5,
    // 풀러가 먼저 끊기 전에 우리 쪽에서 닫는다 — 죽은 소켓을 꺼내 쓰지 않도록.
    idleTimeoutMillis: 10_000,
    // 기본값은 "무한정 기다림"이다. 풀러가 응답하지 않으면 화면이 영영 멈춘다.
    connectionTimeoutMillis: 10_000,
    // 중간 장비가 조용한 연결을 끊는 것을 늦춘다.
    keepAlive: true,
  });

  /**
   * ⚠️ 이 핸들러가 없으면 **프로세스가 죽는다.**
   *
   * node-postgres 는 쉬고 있는 연결이 끊길 때 풀에 `error` 를 쏘는데, 받는 곳이
   * 없으면 Node 가 처리되지 않은 예외로 보고 서버를 내린다. 여기서 받아 기록만 하면
   * 그 연결은 풀에서 빠지고 다음 질의는 새 연결을 받는다.
   */
  pool.on("error", (error) => {
    console.error("[db] 쉬고 있던 연결이 끊겼습니다(다음 질의는 새로 연결합니다):", error);
  });

  /**
   * 재시도는 **클라이언트 확장**으로 붙인다.
   *
   * `db` 를 프록시로 감싸 Promise 를 돌려주게 하면 `$transaction([...])` 이 깨진다 —
   * 배열 형태는 Prisma 고유의 promise 객체를 요구하는데 감싸는 순간 평범한 Promise 가
   * 되기 때문이다. 확장은 그 성질을 그대로 두고 질의만 감싼다.
   */
  const client = new PrismaClient({ adapter: new PrismaPg(pool) }).$extends({
    query: {
      $allOperations: ({ args, query }) => withRetry(() => query(args)),
    },
  }) as unknown as PrismaClient;

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
