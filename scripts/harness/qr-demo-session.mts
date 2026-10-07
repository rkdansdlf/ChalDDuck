import "../load-env.mjs";
import { db } from "../../src/server/db";
import { randomUUID } from "node:crypto";

const code = "QR-DEMO";
let team = await db.team.findUnique({ where: { code } });
if (!team) {
  team = await db.team.create({ data: { code, name: "QR 테스트 팀", course: "소프트웨어공학" } });
}
let member = await db.member.findFirst({ where: { teamId: team.id, name: "테스터" } });
if (!member) {
  member = await db.member.create({ data: { teamId: team.id, name: "테스터", isLeader: true } });
}
const token = randomUUID();
await db.session.create({
  data: { token, memberId: member.id, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) },
});
console.log(token);
process.exit(0);
