/**
 * Vercel 빌드가 **무엇을 할지** 정한다 — 마이그레이션을 적용할지 말지.
 *
 * ## 왜 이게 필요한가 — 실제로 있었던 일 (2026-10-10)
 *
 * `vercel.json` 의 빌드 명령은 `prisma migrate deploy` 로 시작했다. 그리고 **브랜치를 푸시하면 Vercel 이
 * 프리뷰 빌드를 돌린다.** Prisma CLI 는 `DATABASE_URL` 이 아니라 `DIRECT_URL` 을 읽는데(`prisma.config.ts`),
 * Preview 환경의 `DIRECT_URL` 이 운영 DB 를 가리키고 있었다. 그래서 PR 브랜치를 푸시하는 순간 **그 브랜치의
 * 마이그레이션 두 개가 머지 전에 운영 DB 에 적용됐다**(`_prisma_migrations` 에 같은 시각으로 남았다).
 * 운영에 데이터가 없어 피해는 없었지만, 데이터를 옮기는 마이그레이션이었다면 리뷰 전에 운영이 바뀌었다.
 *
 * 마이그레이션은 **머지된 코드가 운영에 나갈 때만** 적용돼야 한다.
 *
 * ## 막는 방향이 중요하다 — 운영을 건드리지 않는다
 *
 * "`VERCEL_ENV` 가 `production` 일 때만 한다" 로 쓰면 이 변수가 어떤 이유로 비었을 때 **운영 배포가
 * 마이그레이션 없이 조용히 성공**한다. 이 저장소가 겪은 `P2022` 사고와 같은 모양이다(스키마는 앞서 있는데
 * 빌드는 초록불). 그래서 반대로 쓴다 — **프리뷰·개발임이 확실할 때만 건너뛴다.** 운영이거나 모르겠으면
 * 지금까지와 똑같이 한다.
 *
 * ## 건너뛰는 것
 *
 * - `prisma migrate deploy` — 위의 이유.
 * - `db:check` — "스키마와 DB 가 같은가" 는 `migrate deploy` **뒤에** 의미가 있다(순서가 반대면 아직 안
 *   적용된 마이그레이션이 차이로 보인다). 마이그레이션을 건너뛰면 새 마이그레이션이 든 PR 의 프리뷰를
 *   막기만 한다. 같은 검사는 CI 가 한다(빈 DB 에 전부 적용한 뒤 동기화 확인).
 *
 * ## 되돌리는 길
 *
 * 프리뷰가 **운영과 분리된 DB** 를 쓰게 되면 `MIGRATE_ON_PREVIEW=1` 을 Preview 환경에 넣는다. 그 값이 있을
 * 때만 프리뷰도 마이그레이션한다 — 운영 DB 를 가리킨 채로 이 값을 넣으면 이 파일이 막으려던 일이 그대로
 * 일어난다.
 */

/** 프리뷰·개발 환경으로 확실한 `VERCEL_ENV` 값. 그 밖의 값(`production`·빈 값)은 운영처럼 다룬다. */
const NON_PRODUCTION = new Set(["preview", "development"]);

/**
 * @param {Record<string, string | undefined>} env 보통 `process.env`
 * @returns {{ migrate: boolean, reason: string }}
 */
export function deployPlan(env) {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim();

  if (NON_PRODUCTION.has(vercelEnv)) {
    if (env.MIGRATE_ON_PREVIEW === "1") {
      return {
        migrate: true,
        reason: `VERCEL_ENV=${vercelEnv} 이지만 MIGRATE_ON_PREVIEW=1 이라 마이그레이션한다 (분리된 DB 여야 한다)`,
      };
    }
    return {
      migrate: false,
      reason: `VERCEL_ENV=${vercelEnv} — 프리뷰는 운영 DB 에 마이그레이션하지 않는다 (빌드만 한다)`,
    };
  }

  return {
    migrate: true,
    reason: vercelEnv ? `VERCEL_ENV=${vercelEnv}` : "VERCEL_ENV 없음 — 운영처럼 다룬다",
  };
}
