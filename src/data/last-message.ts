import type { PrismaClient } from "../generated/prisma/client";

/**
 * 스레드마다 **가장 최근 말 하나만** 가져온다.
 *
 * DM 목록 폴링은 4초마다 돈다. `getDmThreads` 가 하는 일이 크면 그만큼 자주 크다.
 *
 * ## 왜 이렇게 뒤엉켜 있나
 *
 * 처음엔 이 자리에 Prisma 의 `distinct: ["threadKey"]` 가 있었다. **결과는** 스레드마다 한 줄씩
 * 나오니 겉보기에는 맞았고, 실제로 나가는 SQL 을 보니 `DISTINCT ON` 도 `ORDER BY` 도 `LIMIT` 도
 * 없었다 — Postgres 는 방의 메시지를 전부 보내고 Prisma 가 브라우저 쪽에서 중복을 걷어냈다.
 *
 * 그것을 고쳐 `DISTINCT ON` + `= ANY(배열)` 로 바꿨다. **결과만 고쳐졌고 비용은 그대로였다.**
 * 5,006개 대화에서 실제로 읽은 행이 10,013행이었다 — 방이 커질수록 그대로 늘어났다.
 * 이유는 `= ANY($1)` 이다. `threadKey` 가 실행 시점의 배열이라 Postgres 가 인덱스에서
 * `threadKey` 순으로 나오는 걸 **알아낼 수 없고**, 정렬하지 않은 채 전부 모아 정렬한다.
 * (`ORDER BY` 에 `"id" DESC` 를 넣은 것도 한 이유였다. 인덱스에 `id` 가 없어 정렬이 끝나지 않았다.)
 * 인덱스를 정렬까지 맞추도록 새로 만들어도 **결과가 같았다** — `= ANY` 가 벽이었다.
 *
 * 그래서 스레드마다 `LIMIT 1` 을 받는 LATERAL 로 쓴다. 이때 Postgres 는 각 스레드에 대해
 * `teamId` + `threadKey` 로 인덱스를 타고 **첫 행에서 멈춘다.**
 *
 * ```
 * 5,006개 대화에서 실제로 읽은 행
 *   DISTINCT ON + ANY   10,013행   ← 방 크기에 비례해 늘어난다
 *   LATERAL + LIMIT 1        6행   ← 방이 아무리 커도 같다
 * ```
 *
 * ## 왜 이 파일 따로 있나
 *
 * 세션도 서버 액션도 필요 없다 — `client` 를 인자로 받는 쿼리 하나뿐이다. `api.ts` 에 두면 그
 * 파일이 `next/headers` 를 끌어와 **검사 스크립트가 이 함수를 부를 수 없다.** 실제로 검사
 * 스크립트는 사본을 만들어 부르다가, 원본이 되돌아가도 모르는 채로 214건을 통과시켰다.
 * 부를 수 있어야 부르는 것을 검사할 수 있다.
 */
export type LastMessageRow = {
  threadKey: string;
  text: string;
  whenLabel: string | null;
  createdAt: Date;
};

export async function lastMessagePerThread(
  client: Pick<PrismaClient, "$queryRaw">,
  teamId: string,
  threadKeys: string[],
): Promise<LastMessageRow[]> {
  if (threadKeys.length === 0) return [];
  return client.$queryRaw<LastMessageRow[]>`
    SELECT t.k AS "threadKey", m."text", m."whenLabel", m."createdAt"
    FROM unnest(${threadKeys}::text[]) AS t(k)
    CROSS JOIN LATERAL (
      SELECT "text", "whenLabel", "createdAt"
      FROM "Message"
      WHERE "teamId" = ${teamId} AND "threadKey" = t.k
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 1
    ) m
  `;
}
