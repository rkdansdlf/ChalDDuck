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
 * ## 기본값은 "운영 DB 에 쓰지 않는다" — 그리고 모르면 읽어서 확인한다

**마이그레이션은 `VERCEL_ENV` 가 정확히 `production` 일 때만 적용한다.** 이름이 바뀌었거나 비었거나 모르는 값이면
**적용하지 않는다.** "프리뷰가 아니면 운영" 으로 쓰면 환경 이름이 어긋난 빌드가 조용히 운영 DB 를 바꾼다 —
위 사고가 정확히 그 모양이었다(프리뷰인데 운영처럼 굴었다).

그런데 "`production` 일 때만 한다" 만 쓰면 반대 사고가 난다. 이 변수가 어떤 이유로 **운영 배포에서** 비면, 운영이
마이그레이션 없이 조용히 성공한다 — 스키마는 앞서 있는데 빌드는 초록불인 `P2022` 사고와 같은 모양이다.
그래서 **모르는 환경에서는 쓰지 않되, 읽기 전용인 `db:check` 는 돌린다.**

| `VERCEL_ENV` | `migrate`(쓰기) | `check`(읽기) | 이유 |
|---|---|---|---|
| `production` | 한다 | 한다 | 머지된 코드가 운영에 나간다 |
| `preview` · `development` | 안 한다 | 안 한다 | 합치지 않은 코드가 운영 DB 를 바꾸면 안 된다 |
| 없음 · 빈 값 · 모르는 값 | **안 한다** | **한다** | 모르는 환경이 운영 DB 를 바꾸면 안 된다. 그런데 운영이었는데 마이그레이션이 필요했다면 이 검사가 빌드를 **눈에 보이게 실패**시킨다 |

모르는 환경에서 `db:check` 가 통과한다는 것은 "적용할 마이그레이션이 없었다" 는 뜻이라 그대로 배포돼도 안전하다.
`db:check` 는 `migrate deploy` **뒤에** 의미가 있어서(순서가 반대면 아직 안 적용된 마이그레이션이 차이로 보인다),
마이그레이션을 건너뛰는 프리뷰에서는 같이 뺀다 — 새 마이그레이션이 든 PR 의 프리뷰를 막기만 한다. 같은 검사는
CI 가 한다(빈 DB 에 전부 적용한 뒤 동기화 확인).

## 되돌리는 길
 *
 * 프리뷰가 **운영과 분리된 DB** 를 쓰게 되면 `MIGRATE_ON_PREVIEW=1` 을 Preview 환경에 넣는다. 그 값이 있을
 * 때만 프리뷰도 마이그레이션한다 — 운영 DB 를 가리킨 채로 이 값을 넣으면 이 파일이 막으려던 일이 그대로
 * 일어난다.
 *
 * 분리하는 순서(새 Supabase 프로젝트 → 마이그레이션 → 버킷 → Preview 변수 교체 → 마지막에 이 값)는 README 의
 * 「프리뷰 전용 Supabase」에 있다. 순서가 중요하다 — 변수부터 바꾸면 빈 DB 를 보고 프리뷰가 깨지고, 운영 주소가
 * 한 변수라도 남은 채로 이 값을 켜면 위 사고가 되살아난다.
 */

/** 프리뷰·개발 환경으로 확실한 `VERCEL_ENV` 값. 이 값일 때만 `db:check` 까지 건너뛴다. */
const NON_PRODUCTION = new Set(["preview", "development"]);

/**
 * @param {Record<string, string | undefined>} env 보통 `process.env`
 * @returns {{ migrate: boolean, check: boolean, reason: string }}
 *   `migrate` 는 운영 DB 에 **쓴다**(`prisma migrate deploy`), `check` 는 **읽어서** 스키마와 같은지 본다(`db:check`).
 *   `migrate` 가 참이면 `check` 도 참이다 — 적용한 뒤에 확인한다.
 */
export function deployPlan(env) {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim();

  if (vercelEnv === "production") {
    return { migrate: true, check: true, reason: "VERCEL_ENV=production — 운영 배포: 마이그레이션을 적용하고 스키마를 확인한다" };
  }

  if (NON_PRODUCTION.has(vercelEnv)) {
    if (env.MIGRATE_ON_PREVIEW === "1") {
      return {
        migrate: true,
        check: true,
        reason: `VERCEL_ENV=${vercelEnv} 이지만 MIGRATE_ON_PREVIEW=1 이라 마이그레이션한다 (분리된 DB 여야 한다)`,
      };
    }
    return {
      migrate: false,
      check: false,
      reason: `VERCEL_ENV=${vercelEnv} — 프리뷰는 운영 DB 에 마이그레이션하지 않는다 (빌드만 한다)`,
    };
  }

  // 모르는 환경 — 쓰지 않는다. 읽기 전용 확인은 한다: 운영이었는데 마이그레이션이 필요했다면 여기서 빌드가 실패한다.
  return {
    migrate: false,
    check: true,
    reason: `⚠️ VERCEL_ENV=${vercelEnv || "없음"} — 어느 환경인지 모른다. 운영 DB 에 아무것도 적용하지 않고 스키마 동기화만 확인한다 (운영 배포였다면 변수를 확인하세요)`,
  };
}
