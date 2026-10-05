"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { normalizeName } from "@/features/roles/roster-model";
import { attemptKey, clearAttempts, countFailure, isLocked } from "@/server/auth/attempts";
import { issueRejoinCode } from "@/server/auth/issue";
import { normalizeRejoinCode, verifyRejoinCode } from "@/server/auth/rejoin-code";
import { db } from "@/server/db";
import { REJOIN_EXPIRED } from "@/lib/rejoin-expire";
import { settleJoinRequest } from "@/server/invite/settle";
import { leaderIds, notify } from "@/server/notify/create";
import { describeDevice, deviceIdOf, requireLeader, requireSessionMember, startSession } from "@/server/session";

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

async function findMember(teamCode: string, name: string) {
  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) return null;
  return db.member.findUnique({
    where: { teamId_name: { teamId: team.id, name: normalizeName(name) } },
  });
}

/** 1번 길 — 재입장 코드로 바로 들어온다. */
export async function rejoinWithCode(
  teamCode: string,
  name: string,
  code: string,
): Promise<"ok" | "wrong" | "locked" | "no-code" | "unknown"> {
  const key = attemptKey(teamCode, name);
  if (await isLocked(key)) return "locked";

  const member = await findMember(teamCode, name);
  // **그런 사람이 아니면 실패로 세지 않는다.** 맞힐 코드가 없으니 대충 아무 것이나 찍는 것과
  // 같다. 예전에도 세었더니, 팀 코드와 이름 아무 쌍이나 알고 있는
  // 사람이 그 쌍을 10분씩 잠글 수 있었다 — 심지어 자신이 속하지도 않은 팀의.
  if (!member) return "unknown";
  // 코드를 아직 받지 못한 옛 기록. 팀장 승인으로 보내야 한다.
  if (!member.rejoinCodeHash) return "no-code";

  if (!verifyRejoinCode(normalizeRejoinCode(code), member.rejoinCodeHash)) {
    await countFailure(key);
    return "wrong";
  }

  await clearAttempts(key);
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

  // **이 사람의 대기 요청을 지우지 않는다.**
  //
  // 예전에는 여기서 `deleteMany({ memberId, status: "pending" })` 로 지우고 새로 만들었다.
  // "같은 사람이 여러 번 눌러 요청이 쌓이지 않게" 하려는 의도였지만, 이 길은 **인증이 없다**
  // — 재입장 코드도, 세션도 없고 (초대 코드, 이름) 만 알면 된다. 그래서 그 이름을 아는
  // 사람은 누구든 **진짜 팀원의 요청을 지우고 자기 것을 대신 심을 수 있었다.** 지워진 요청은
  // 팀장 목록에도 남지 않으니 아무도 알 수 없었다.
  //
  // 대신 **자기 브라우저가 이미 들고 있는 요청만** 고친다 — 토큰은 자기 쿠키에 있는 것으로
  // 찾아야 한다. 남의 토큰을 알 수는 없으므로 남의 요청은 손대지 않는다. 누르면 아무 일도
  // 일어나지 않거나 자기 요청이 쌓일 뿐, 남의 것이 사라지지 않는다.
  const store = await cookies();
  const label = await describeDevice();
  const mine = store.get(CLAIM_COOKIE)?.value;
  const own = mine
    ? await db.memberClaim.findFirst({
        where: { token: mine, memberId: member.id, status: "pending" },
        select: { id: true, token: true },
      })
    : null;

  let token: string;
  if (own) {
    // **토큰은 그대로 둔다.** 새로 심으면 심는 순간 자기 쿠키의 값이 잠깐 통하지 않고,
    // 그동안의 폴링이 `{status:"none"}` 을 받아 사용자를 튕겨내게 된다.
    token = own.token;
    // 기기 설명만 고친다 — 같은 기기에서 다시 누른 것이라면 달라질 게 없다.
    await db.memberClaim.update({ where: { id: own.id }, data: { label } });
  } else {
    token = randomUUID();
    await db.memberClaim.create({
      data: { memberId: member.id, token, label },
    });
  }

  store.set(CLAIM_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CLAIM_MAX_AGE,
  });

  // 팀장에게 알린다. **같은 사람이 여러 번 눌러도 알림이 쌓이지 않게** 먼저 지운다 — 이건
  // 알림의 중복을 막는 것이지 남의 요청을 지우는 것이 아니다(요청은 위에서 지우지 않는다).
  await db.notification.deleteMany({
    where: { memberId: member.id, kind: "rejoin-request", readAt: null },
  });
  await notify({
    to: await leaderIds(member.teamId),
    kind: "rejoin-request",
    title: `${member.name}님이 새 기기에서 들어오려 합니다`,
    body: "본인이 맞는지 확인하고 승인해 주세요",
    href: "/team/access",
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
export async function checkRejoinApproval(): Promise<
  "approved" | "pending" | "rejected" | "expired" | "none"
> {
  const store = await cookies();
  const token = store.get(CLAIM_COOKIE)?.value;
  if (!token) return "none";

  const claim = await db.memberClaim.findUnique({ where: { token } });
  if (!claim) return "none";
  if (claim.status === "pending") return "pending";

  // **만료는 거절이 아니다 — 2026-10-03.** 예전에는 `pending` 도 `approved` 도 아닌 무엇이든
  // "거절" 로 돌려줬다. 그 안에 `expired` 가 들어오면 사용자는 **거절당한 것**으로 안내되고
  // 팀장에게 따지러 간다 — 실제로는 팀장이 3일 동안 안 본 것이고, 다시 요청하면 된다.
  //
  // **잘못 말하면 되돌릴 수 없다.** 화면에 "거절" 이라고 떴다가 나중에 "만료였습니다" 로
  // 고치면, 그 사이에 사용자가 팀장을 의심하고 팀장을 바꾼 것이다.
  if (claim.status === REJOIN_EXPIRED) {
    store.delete(CLAIM_COOKIE);
    return "expired";
  }

  if (claim.status !== "approved") {
    store.delete(CLAIM_COOKIE);
    return "rejected";
  }

  // **세션을 심은 다음에 쿠키를 지운다.** 예전에는 지터를 먼저 해서, 그 뒤의
  // `startSession` 이 한 번이라도 꼬이면 토큰을 잃어버렸다. 그러면 요청은 `approved` 인데
  // (팀장 목록에도 없으니) 아무도 다시 꺼낼 수 없고, 팀장이 두 번 승인해도 돌아올 수 없는
  // 사람이 된다. 되돌릴 수 없는 걸 먼저 하는 순서였다.
  try {
    // 팀을 나갔다 온 사람 — 재입장은 명단에 다시 세우는 일이다.
    await db.member.update({ where: { id: claim.memberId }, data: { leftAt: null } });
    await startSession(claim.memberId, token);
  } catch (error) {
    // 중복 폴링이 겹치면 위에서 이미 누군가 처리했다 — 같은 사람이 두 번 만들어지지
    // 않도록 쿠키는 치워 주고 끝낸다. 그래야 매번 재시도하지 않는다.
    if ((error as { code?: string }).code === "P2002") {
      store.delete(CLAIM_COOKIE);
      return "none";
    }
    // 그 밖의 실패는 **토큰을 그대로 둔다.** 다음 폴링이 다시 시도할 수 있어야 한다.
    throw error;
  }

  await db.memberClaim.delete({ where: { token } });
  store.delete(CLAIM_COOKIE);
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

/**
 * 기기 하나를 내보낸다. 본인 기기만 — 남의 기기를 끊을 수는 없다.
 *
 * `deviceId` 는 토큰이 아니라 토큰의 해시다(`deviceIdOf`). 내 세션들 중에서 같은 것을 찾는다.
 */
export async function revokeDevice(deviceId: string): Promise<void> {
  const me = await requireSessionMember();

  const mine = await db.session.findMany({ where: { memberId: me.id }, select: { token: true } });
  const target = mine.find((s) => deviceIdOf(s.token) === deviceId);
  if (target) await db.session.deleteMany({ where: { token: target.token, memberId: me.id } });
  revalidatePath("/team", "layout");
}

/** 재입장 코드를 새로 만든다(잃어버렸을 때). 이전 코드는 즉시 못 쓰게 된다. */
export async function regenerateRejoinCode(): Promise<string> {
  const me = await requireSessionMember();
  return issueRejoinCode(me.id);
}

/**
 * 팀장이 새로 들어오려는 사람을 승인하거나 거절한다.
 *
 * 판정과 갱신, 그리고 **초대 자리 세기**는 전부 `invite/settle.ts` 의 한 트랜잭션 안이다.
 * 예전에는 "아직 pending 이지?" 를 읽고 **그 뒤에** 따로 갱신했다 — 그 사이가 구멍이었다.
 * 두 번 누른 손이 모두 통과하면 같은 요청을 두 번 처리하고, 초대 자리도 두 번 센다.
 *
 * ⚠️ **여기서는 `Member` 를 만들지 않는다.** 팀원이 되는 것은 요청한 그 브라우저에서
 * 일어난다(`checkJoinApproval`) — 세션 쿠키를 심을 수 있는 곳이 거기뿐이다. 여기서 만들면
 * 팀장 기기에 그 사람의 계정이 생겨 버린다.
 *
 * `stale-invite` 는 **승인이 반영되었지만** 이 초대가 이미 닫혀 있다는 뜻이다. 팀장에게
 * 말해 주되 막지는 않는다 — 만든 사람이 팀장 자신이고, 신청인은 아무 잘못이 없다.
 *
 * `name-taken` 는 **승인하지 않았다** — 팀에 같은 이름이 이미 있다(2026-09-28). 예전엔 여기서
 * 막지 않고 `approved` 로 넘겼는데, `Member` 의 이름 유일 제약이 **신청인의 브라우저가
 * 폴링할 때** 터졌다. 즉 팀장이 승인한 뒤에야 고장나고, 그때 서버는 그 예외를 "폴링이 겹쳤다"
 * 고 읽어 요청을 지워 버렸다. 막는 자리를 승인으로 옮겼다(`invite/settle.ts`).
 */
export async function resolveJoinRequest(
  requestId: string,
  approve: boolean,
): Promise<"ok" | "gone" | "stale-invite" | "name-taken"> {
  const leader = await requireLeader();

  const result = await settleJoinRequest({
    requestId,
    teamId: leader.teamId,
    approverId: leader.id,
    approve,
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return result;
}
