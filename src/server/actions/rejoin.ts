"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { issueRejoinCode } from "@/server/auth/issue";
import { normalizeRejoinCode, verifyRejoinCode } from "@/server/auth/rejoin-code";
import { db } from "@/server/db";
import { describeDevice, requireLeader, requireSessionMember, startSession } from "@/server/session";

/**
 * 재입장 — **이미 있는 이름으로 새 기기에서 들어오는 길.**
 *
 * 예전에는 이름만 적으면 그대로 통과했다. 초대 코드를 아는 사람이 팀원을 사칭할 수 있었고,
 * 온보딩이 `upsert` 라 사칭한 사람이 상대의 희망 역할까지 덮어썼다(= 역할 추첨 결과가 바뀐다).
 *
 * 이제 두 갈래만 있다:
 * 1. **재입장 코드** — 첫 입장 때 받은 코드를 적으면 바로 들어온다.
 * 2. **팀장 승인** — 코드가 없으면 요청을 만들고 팀장이 승인해야 들어온다.
 *
 * 처음 들어오는 사람(새 이름)은 예전과 똑같이 아무 마찰이 없다. 사칭이 일어나는 곳은
 * 재입장뿐이라 거기만 조인다.
 */

/** 대기 중인 재입장 요청을 들고 있는 쿠키. 세션 쿠키와 다르다 — 아직 아무 권한도 없다. */
const CLAIM_COOKIE = "cd_claim";
const CLAIM_MAX_AGE = 60 * 60 * 24; // 하루

/** 같은 브라우저가 코드를 계속 찍어 보지 못하게. 간단한 메모리 카운터다. */
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;

function tooManyAttempts(key: string): boolean {
  const seen = attempts.get(key);
  if (!seen) return false;
  if (Date.now() > seen.until) {
    attempts.delete(key);
    return false;
  }
  return seen.count >= MAX_ATTEMPTS;
}

function countAttempt(key: string) {
  const seen = attempts.get(key);
  if (!seen || Date.now() > seen.until) {
    attempts.set(key, { count: 1, until: Date.now() + LOCK_MS });
    return;
  }
  seen.count += 1;
}

async function findMember(teamCode: string, name: string) {
  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) return null;
  return db.member.findUnique({
    where: { teamId_name: { teamId: team.id, name: name.trim() } },
  });
}

/** 1번 길 — 재입장 코드로 바로 들어온다. */
export async function rejoinWithCode(
  teamCode: string,
  name: string,
  code: string,
): Promise<"ok" | "wrong" | "locked" | "no-code"> {
  const key = `${teamCode}:${name}`;
  if (tooManyAttempts(key)) return "locked";

  const member = await findMember(teamCode, name);
  if (!member) {
    countAttempt(key);
    return "wrong";
  }
  // 코드를 아직 받지 못한 옛 기록. 팀장 승인으로 보내야 한다.
  if (!member.rejoinCodeHash) return "no-code";

  if (!verifyRejoinCode(normalizeRejoinCode(code), member.rejoinCodeHash)) {
    countAttempt(key);
    return "wrong";
  }

  attempts.delete(key);
  // 나갔던 사람이 돌아오는 경우 — 재입장 문(코드·승인)을 거쳤으니 명단에 되돌린다.
  if (member.leftAt) await db.member.update({ where: { id: member.id }, data: { leftAt: null } });
  await startSession(member.id);
  return "ok";
}

/**
 * 2번 길 — 팀장에게 승인을 요청한다.
 *
 * 토큰을 지금 만들어 요청한 브라우저의 쿠키에 담아 둔다. 팀장이 승인하면 **이 토큰으로**
 * 세션이 만들어진다 — 승인하는 사람의 브라우저에 쿠키를 심을 수는 없기 때문이다.
 */
export async function requestRejoinApproval(
  teamCode: string,
  name: string,
): Promise<"requested" | "unknown"> {
  const member = await findMember(teamCode, name);
  if (!member) return "unknown";

  // 같은 사람이 여러 번 눌러 요청이 쌓이지 않게 정리한다.
  await db.memberClaim.deleteMany({ where: { memberId: member.id, status: "pending" } });

  const token = randomUUID();
  await db.memberClaim.create({
    data: { memberId: member.id, token, label: await describeDevice() },
  });

  (await cookies()).set(CLAIM_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CLAIM_MAX_AGE,
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return "requested";
}

/**
 * 요청한 브라우저가 스스로 확인한다.
 *
 * 승인됐으면 그 자리에서 세션을 만든다. 세션 쿠키를 심을 수 있는 것은 **요청한
 * 브라우저 자신**뿐이라, 팀장이 승인하는 순간이 아니라 여기서 완성된다.
 */
export async function checkRejoinApproval(): Promise<"approved" | "pending" | "rejected" | "none"> {
  const store = await cookies();
  const token = store.get(CLAIM_COOKIE)?.value;
  if (!token) return "none";

  const claim = await db.memberClaim.findUnique({ where: { token } });
  if (!claim) return "none";
  if (claim.status === "pending") return "pending";

  store.delete(CLAIM_COOKIE);
  if (claim.status !== "approved") return "rejected";

  await db.member.update({ where: { id: claim.memberId }, data: { leftAt: null } });
  await startSession(claim.memberId, token);
  await db.memberClaim.delete({ where: { token } });
  return "approved";
}

/** 팀장이 승인하거나 거절한다. */
export async function resolveRejoinClaim(
  claimId: string,
  approve: boolean,
): Promise<"ok" | "gone"> {
  const leader = await requireLeader();

  // 우리 팀 요청인지 서버에서 확인한다.
  const claim = await db.memberClaim.findFirst({
    where: { id: claimId, status: "pending", member: { teamId: leader.teamId } },
  });
  if (!claim) return "gone";

  await db.memberClaim.update({
    where: { id: claim.id },
    data: {
      status: approve ? "approved" : "rejected",
      resolvedAt: new Date(),
      approvedById: leader.id,
    },
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return "ok";
}

/** 기기 하나를 내보낸다. 본인 기기만 — 남의 기기를 끊을 수는 없다. */
export async function revokeDevice(token: string): Promise<void> {
  const me = await requireSessionMember();

  await db.session.deleteMany({ where: { token, memberId: me.id } });
  revalidatePath("/team", "layout");
}

/** 재입장 코드를 새로 만든다(잃어버렸을 때). 이전 코드는 즉시 못 쓰게 된다. */
export async function regenerateRejoinCode(): Promise<string> {
  const me = await requireSessionMember();
  return issueRejoinCode(me.id);
}
