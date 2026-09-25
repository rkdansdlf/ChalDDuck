import { config } from "dotenv";

/**
 * Next 밖에서 도는 도구(Prisma CLI·시드)의 환경 변수.
 *
 * `import "dotenv/config"` 는 `.env` 만 읽는다. 그러면 `next dev` 는 로컬 DB 를 보는데
 * `prisma migrate`·`db:seed` 는 운영 DB 로 가는 일이 생긴다 — 개발용으로 돌린 명령이
 * 실제 데이터를 지우거나 바꾼다.
 *
 * 그래서 Next 와 같은 순서로 `.env.development.local` 을 먼저 읽는다. 앞 파일의 값이
 * 이긴다(빈 값도 값이다). 그 파일이 없으면(배포 환경) `.env` 만 읽는 것과 같다.
 */
config({ path: [".env.development.local", ".env"], quiet: true });
