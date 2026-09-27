import "./load-env.mjs";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * `prisma/schema.prisma` 와 실제 DB 가 같은 모양인지 확인한다. 다르면 **1 로 끝난다.**
 *
 * 왜 이게 필요한가 — 실제로 있었던 일:
 *
 *   1. 어떤 커밋이 `prisma/schema.prisma` 에 `Message.attachPath` 를 추가했다.
 *      마이그레이션 파일은 **같은 커밋에 없었고**, 뒤 커밋에서나 추가됐다.
 *   2. 그 상태로 배포했다. `vercel.json` 의 `prisma migrate deploy` 는 "적용할 것이
 *      없다" 고 정상 종료하고(할 것이 없으니까), 빌드도 초록불이었다.
 *      —— 마이그레이션이 없다는 사실은 `migrate deploy` 입장에서 아무 문제가 아니었다.
 *   3. 그래서attachPath 를 읽는 Prisma 클라이언트가 올라갔고, 첫 질의에서
 *      `P2022: The column Message.attachPath does not exist` 로 죽었다.
 *   4. 죽은 건 `/chat` 렌더였다. 서버 컴포넌트라 예외가 RSC 페이로드의 에러 행으로
 *      바뀌어, 브라우저에는 **React error #441** 이라고만 찍혔다. 진짜 원인은
 *      Vercel 함수 로그에 숨어 있었다(서버 로그를 봐야 알 수 있는 형태였다).
 *
 * 즉 "스키마만 바꾸고 마이그레이션을 안 넣었다" 는 **배포가 조용히 성공하고,
 * 화면만 깨지는** 실패다. `migrate deploy` 는 이걸 절대 잡지 못한다 — 자기가 할 일을
 * 다 했다고 생각하기 때문이다. 그래서 배포 파이프라인에서 **직접** 물어본다.
 *
 * `--exit-code` 규약(Prisma 문서): 비어 있으면 0, 실제 오류면 1, **차이가 있으면 2**.
 * 2 만을 "실패"로 보고 나머지는 그대로 통과시킨다 — 연결이 안 되는 것을
 * "스키마가 맞다"로 넘기면 안 되기 때문이다.
 *
 * `migrate deploy` **뒤에** 도는 것이 전제다. 순서가 반대면 아직 적용되지 않은
 * 마이그레이션이 "차이"로 보여 정상 배포가 걸린다.
 */

const prisma = "node_modules/.bin/prisma";
if (!existsSync(prisma)) {
  throw new Error("`node_modules/.bin/prisma` 가 없습니다. 의존성을 먼저 설치해 주세요.");
}

const result = spawnSync(
  prisma,
  [
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--exit-code",
  ],
  { encoding: "utf8" },
);

if (result.error) throw result.error;
if (result.status === 0) {
  console.log("[check] 스키마와 DB 가 같습니다.");
  process.exit(0);
}
if (result.status === null) {
  console.error(result.stderr);
  throw new Error("`prisma migrate diff` 가 시그널로 끝났습니다.");
}

// 1 은 Prisma 자체의 오류(연결 실패·설정 잘못)다. "차이가 있다"와 구분해야 한다.
if (result.status === 1) {
  console.error(result.stderr);
  throw new Error("`prisma migrate diff` 가 실패했습니다. 위 로그를 보세요.");
}

console.error(result.stdout);
console.error(
  [
    "",
    "schema.prisma 에는 있지만 DB 에 없는 것이 있습니다.",
    "이대로 배포하면 읽는 순간 예외가 납니다(P2022) — 화면은 'React error #441' 로만 보입니다.",
    "",
    "  1. prisma/migrations 에 마이그레이션을 추가합니다:",
    "       npx prisma migrate dev --name <이름>",
    "  2. 그 커밋에 prisma/schema.prisma 와 마이그레이션이 **함께** 들어갔는지 확인합니다.",
    "     스키마만 먼저 커밋하면(과거에 있었던 일) 이 지점에서 걸러집니다.",
  ].join("\n"),
);
process.exit(1);
