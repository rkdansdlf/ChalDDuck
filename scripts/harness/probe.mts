/**
 * 통과 확인 — 하네스가 **서버 액션의 첫 줄까지** 도달하는가.
 *
 * 이게 안 되면 드라이브 통합 검사는 애초에 성립하지 않는다(액션을 부르는 대신 우회하게
 * 되어 "액션이 스스로 막는지"를 보지 못한다). 그래서 본편보다 먼저 돌린다.
 *
 * 앱 모듈을 `import` 로 정적 가져오면 이 파일이 평가된 **뒤에** 앱 모듈이 적재된다.
 * 요청 컨텍스트 심기는 `drive.mts` 가 먼저 끝내므로 그 뒤가 맞다.
 *
 *   npm run test:drive:probe
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";

installRequestContext();

import { randomUUID } from "node:crypto";

// 앱 모듈은 **정적으로 가져오지 않는다** — ESM 은 파일 안의 `import` 를 모두 먼저 평가하므로
// 위의 `installRequestContext()` 이 돌기 전에 적재된다. 그러면 심은 자리가 통하지 않고
// 진짜 `next/headers` 가 적재된다(2026-09-28 에 여기서 한 번 헤맸다).
const { db } = await import("../../src/server/db.js");
const { requireSessionMember } = await import("../../src/server/session.js");

let failed = 0;
function ok(label: string, cond: boolean, extra?: unknown): void {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) {
    failed += 1;
    if (extra !== undefined) console.log(`      ${String(extra)}`);
  }
}

async function message(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * ⚠️ **로컬 DB 에서만 돈다.** 팀·팀원·파일을 만들고 지운다 — 서버 액션은 그 경계를
 * 지켰지만 하네스 자체는 아니다. 운영 DB 를 가리키는 채로 한 번 돌면 팀이 남는다.
 */
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL 이 없습니다.");
{
  const host = new URL(connectionString).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`하네스는 로컬 DB 에서만 돕니다. 지금은 ${host} 를 가리킵니다.`);
  }
}

console.log("\n하네스 통과 확인 (서버 액션의 첫 줄까지)");

const team = await db.team.create({
  data: { name: "하네스 통과 확인용", course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
});
const minjun = await db.member.create({ data: { teamId: team.id, name: "김민준" } });
const seoyeon = await db.member.create({ data: { teamId: team.id, name: "이서연" } });
const tokenOf = async (memberId: string) => {
  const token = randomUUID();
  await db.session.create({
    data: { token, memberId, expiresAt: new Date(Date.now() + 3600_000) },
  });
  return token;
};
const minjunToken = await tokenOf(minjun.id);
const seoyeonToken = await tokenOf(seoyeon.id);

// ① 세션이 없으면 액션은 멈춘다 — 하네스가 "항상 누군가" 라는 규칙을 지키는지 본다.
session.nobody();
const refused = await message(() => requireSessionMember());
ok("세션이 없으면 '로그인이 필요합니다'", refused.includes("로그인이 필요"), refused || "(거부되지 않음)");

// ② 심은 세션으로 팀원이 나온다 = 요청 컨텍스트를 잘 통과했다.
session.as(minjunToken);
const me = await requireSessionMember();
ok("심은 세션으로 팀원이 나온다", me?.id === minjun.id, me);
ok("그 팀원은 우리가 만든 사람이다", me?.teamId === team.id);

// ③ 엉뚱한 팀원의 세션으로 부르면 **그 사람으로** 처리되어야 한다 — 하네스가 팀을
//    바꿔치기하지 않는다는 뜻이다. 여기서 속이면 다른 팀 차단 검사가 통째로 무의미해진다.
session.as(seoyeonToken);
ok("세션을 바꾸면 그 사람이 된다", (await requireSessionMember())?.id === seoyeon.id);

// ④ 썼던 세션을 지우면 다시 멈춘다 — 항아리가 요청마다 새로 만들어지지 않는다는 뜻이다.
session.nobody();
const refusedAgain = await message(() => requireSessionMember());
ok("세션을 지우면 다시 멈춘다", refusedAgain.includes("로그인이 필요"), refusedAgain || "(그대로 통과)");

console.log(
  failed === 0
    ? "\n하네스가 서버 액션 경계를 통과합니다.\n"
    : `\n${failed}건 실패 — 통합 검사를 시작하기 전에 이게 먼저입니다.\n`,
);

await db.member.deleteMany({ where: { teamId: team.id } });
await db.team.delete({ where: { id: team.id } });
await db.$disconnect();
process.exit(failed === 0 ? 0 : 1);