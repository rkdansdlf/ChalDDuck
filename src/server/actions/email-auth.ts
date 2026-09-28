"use server";

import { cookies } from "next/headers";
import { db } from "@/server/db";
import { startSession } from "@/server/session";
import {
  hashOtp,
  isValidEmail,
  issueEmailToken,
  MAX_OTP_ATTEMPTS,
  normalizeEmail,
  OTP_EXPIRY_MS,
  sendEmailOtp,
} from "@/server/auth/email-token";

/**
 * **인증에 성공한 이메일**을 심어 두는 쿠키.
 *
 * 여러 팀에 속한 사람이 고른 팀을 세션으로 연결하려면 "이 브라우저가 그 이메일의 소유자임"을
 * 서버가 이미 확인했다는 사실이 화면을 넘어 다시 도착해야 한다. 인증번호·매직 링크를 통과한
 * 이 순간에만 심고, 팀을 고르면 바로 지운다.
 *
 * 세션 토큰이 아니라 **어느 이메일을 증명했는지**만 담는다 — 이것만으로는 아무 권한도 없고,
 * 팀원을 만들 수 있으려면 아래 `selectEmailTeamMember` 가 이 이메일과 일치하는 명단을 찾을
 * 수 있어야 한다. `cd_remember` 와 같은 근거다(쿠키는 `httpOnly` 라 스크립트로 바꿀 수 없다).
 */
const EMAIL_COOKIE = "cd_email";

const EMAIL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  // 인증이 유효한 동안만. 인증번호(10분)가 지나면 다시 인증해야 한다.
  maxAge: Math.floor(OTP_EXPIRY_MS / 1000),
} as const;

export type EmailAuthRequestResult =
  | { ok: true; previewCode?: string }
  | { ok: false; reason: "invalid-email" | "cooldown" | "send-failed" | "error" };

export type EmailVerifyResult =
  | { status: "ok"; teamName: string }
  | {
      status: "multiple";
      members: Array<{
        memberId: string;
        memberName: string;
        teamId: string;
        teamName: string;
        course: string;
      }>;
    }
  | { status: "no-teams"; email: string }
  | { status: "wrong"; remainingAttempts: number }
  | { status: "expired" | "locked" | "error" };

/**
 * 이메일로 6자리 인증번호 및 매직링크 요청.
 *
 * ⚠️ **예전에는 Supabase Auth `signInWithOtp` 를 병행했다 — 그것이 "보냈는데 안 온다" 의
 * 원인이었다.** 같은 주소로 6자리가 **두 개** 나갔다. 하나는 여기서 발급해 해시로 저장한
 * 코드(Resend 가 나름), 다른 하나는 Supabase 가 알아서 만든 **다른** 코드였는데, 화면에는
 * 어느 쪽인지 표시되지 않았다. 게다가 성공 판정이 이 둘의 "둘 다 실패했나"로 계산됐는데,
 * Supabase 는 **메일을 하나도 안 보내도 성공을 보고한다** — API 호출이 200 이었다는 뜻일 뿐이고
 * Supabase 기본 SMTP 는 시간당 몇 통 제한에 걸리면 조용히 버린다. 그래서 `RESEND_API_KEY` 가
 * 비어 있어 실제로는 메일이 0통이어도 "전송했습니다"가 되어 있었다.
 *
 * 이 앱은 애초에 Supabase Auth 를 쓰지 않는다(가입·로그인이 없는 제품이고 Supabase 는
 * 파일 저장소 전용이다 — `server/storage/client.ts`). 인증은 여기 발급한 해시 토큰만 보면
 * 충분하므로, **발송자도 검증자도 하나씩만 남긴다.**
 */
export async function requestEmailAuth(email: string): Promise<EmailAuthRequestResult> {
  const norm = normalizeEmail(email);
  if (!isValidEmail(norm)) {
    return { ok: false, reason: "invalid-email" };
  }

  try {
    const { code, token, isCooldown } = await issueEmailToken(norm);
    if (isCooldown) {
      return { ok: false, reason: "cooldown" };
    }

    // Resend 가 이 앱에서 인증번호가 실제로 나가는 **유일한** 길이다.
    const resend = await sendEmailOtp(norm, code, token);

    /**
     * **보냈다고 말하지 않는 것이, 보내지 못한 것보다 낫다.**
     *
     * 토큰은 이미 발급됐으니 형식적으로는 "보냈다"가 되지만, 메일은 안 나갔고 운영에서는
     * 인증번호를 화면에 돌려줄 수도 없다. 그러면 사용자는 받은 것처럼 기다리다 10분 뒤에야
     * 만료됩니다. 성공처럼 보이게 하는 것이 발송 실패를 알리는 것보다 나쁩니다.
     */
    if (!resend.success) {
      return { ok: false, reason: "send-failed" };
    }

    return { ok: true, previewCode: resend.previewCode };
  } catch (err) {
    console.error("[Email Auth] requestEmailAuth error:", err);
    return { ok: false, reason: "error" };
  }
}

/**
 * 6자리 인증번호 검증 및 로그인 처리.
 *
 * 예전에는 Supabase 검증을 **먼저** 돌리고 그 다음에 여기로 넘어왔다. 그 결과가 두 가지
 * 나빴다. 하나는 두 발송자가 준 서로 다른 코드 중 어느 쪽도 검증되면 안 되는 상황이 생겼다는
 * 것이고(오입력 5회가 두 코드 모두를 함께 무효화했다), 다른 하나는 **시도 횟수를 세지 않는
 * 길이 생겼다** — Supabase 검증이 앞에서 실패하면 로컬 `attempts` 는 늘지 않아, 브루트포스가
 * 사실상 무제한이었다. 검증 경로를 하나만 남기면 카운트가 곧 그 하나뿐이 된다.
 */
export async function verifyEmailAuthCode(
  email: string,
  code: string,
): Promise<EmailVerifyResult> {
  const norm = normalizeEmail(email);
  const cleanCode = code.trim();

  if (!isValidEmail(norm) || cleanCode.length !== 6) {
    return { status: "wrong", remainingAttempts: MAX_OTP_ATTEMPTS };
  }

  // 1. 대기 중인 토큰 조회
  const record = await db.emailAuthToken.findFirst({
    where: { email: norm },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return { status: "expired" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await db.emailAuthToken.delete({ where: { id: record.id } });
    return { status: "expired" };
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await db.emailAuthToken.delete({ where: { id: record.id } });
    return { status: "locked" };
  }

  // 6자리 해시 일치 여부 확인
  const expectedHash = hashOtp(cleanCode);
  if (record.codeHash !== expectedHash) {
    const newAttempts = record.attempts + 1;
    if (newAttempts >= MAX_OTP_ATTEMPTS) {
      await db.emailAuthToken.delete({ where: { id: record.id } });
      return { status: "locked" };
    } else {
      await db.emailAuthToken.update({
        where: { id: record.id },
        data: { attempts: newAttempts },
      });
      return { status: "wrong", remainingAttempts: MAX_OTP_ATTEMPTS - newAttempts };
    }
  }

  // 인증 성공: 토큰 소모
  await db.emailAuthToken.delete({ where: { id: record.id } });

  // 해당 이메일의 활성 멤버들 조회
  return completeEmailLogin(norm);
}

/** 매직 링크 토큰 검증 및 로그인 처리 */
export async function verifyEmailMagicToken(token: string): Promise<EmailVerifyResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { status: "error" };

  const record = await db.emailAuthToken.findUnique({
    where: { token: cleanToken },
  });

  if (!record) {
    return { status: "expired" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await db.emailAuthToken.delete({ where: { id: record.id } });
    return { status: "expired" };
  }

  // 인증 성공: 토큰 소모
  await db.emailAuthToken.delete({ where: { id: record.id } });

  return completeEmailLogin(record.email);
}

/** 이메일 인증 완료 후 세션 연결 */
async function completeEmailLogin(email: string): Promise<EmailVerifyResult> {
  // 여기 지나는 값은 인증번호나 매직 링크를 통과한 이메일이다 — 팀을 고르는 다음 단계가
  // "이 브라우저가 이 이메일의 소유자임"을 trusting 없이 다시 볼 수 있게 해 둔다.
  (await cookies()).set(EMAIL_COOKIE, normalizeEmail(email), EMAIL_COOKIE_OPTIONS);

  const members = await db.member.findMany({
    where: {
      email,
      leftAt: null,
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          course: true,
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  // 이메일 인증 시점 업데이트
  await db.member.updateMany({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });

  if (members.length === 0) {
    return { status: "no-teams", email };
  }

  if (members.length === 1) {
    const target = members[0];
    // 팀이 하나면 고를 게 없다 — 증명 쿠키는 남길 이유가 없으므로 치운다.
    (await cookies()).delete(EMAIL_COOKIE);
    await startSession(target.id);
    return { status: "ok", teamName: target.team.name };
  }

  return {
    status: "multiple",
    members: members.map((m) => ({
      memberId: m.id,
      memberName: m.name,
      teamId: m.team.id,
      teamName: m.team.name,
      course: m.team.course,
    })),
  };
}

/** 여러 팀에 속한 경우 특정 팀원 선택하여 로그인 */
export async function selectEmailTeamMember(memberId: string): Promise<{ ok: boolean }> {
  const store = await cookies();
  const provenEmail = store.get(EMAIL_COOKIE)?.value;

  // **인증하지 않은 쪽으로는 세션을 만들지 않는다.**
  //
  // 예전에는 `memberId` 하나만 보고 세션을 만들었다. 그 값은 화면(그리고 `/join/switch` 의
  // URL)을 통해 온 **`memberId` 그 자체**였으므로, 누구라도 팀원 한 명의 `id` 를 알면 그
  // 사람 세션이 붙었다 — 초대 코드도, 인증번호도, 이름도 필요 없었다. 찰떡은 가입·로그인이 없는
  // 앱이라 이 길이 **전부 로그인**이라, 여는 순간 누구의 팀이든 통했다.
  //
  // 지금은 인증번호·매직 링크를 통과한 이메일만 쿠키에 남고(`completeEmailLogin`), 여기서는
  // 그 이메일과 **일치하는 명단 안에서만** 고를 수 있다. 화면이 다른 팀원의 `id` 를 보내도
  // 이메일과 맞지 않아 거절된다.
  if (!provenEmail || !isValidEmail(provenEmail)) return { ok: false };

  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { id: true, leftAt: true, email: true },
  });

  if (!member || member.leftAt) return { ok: false };
  if (member.email !== provenEmail) return { ok: false };

  // 이 인증은 한 번 쓰면 끝난다 — 같은 쿠키로 다른 팀원에 다시 들어가지 못하게 한다.
  store.delete(EMAIL_COOKIE);

  await startSession(member.id);
  return { ok: true };
}

/** 현재 사용자의 등록된 이메일 조회 */
export async function getMyEmail(): Promise<string | null> {
  const { requireSessionMember } = await import("@/server/session");
  const me = await requireSessionMember();
  const record = await db.member.findUnique({
    where: { id: me.id },
    select: { email: true },
  });
  return record?.email ?? null;
}

/** 현재 사용자의 이메일 등록 및 변경 */
export async function updateMemberEmail(newEmail: string): Promise<{ ok: boolean; reason?: string }> {
  const { requireSessionMember } = await import("@/server/session");
  const me = await requireSessionMember();
  const norm = normalizeEmail(newEmail);

  if (newEmail.trim() && !isValidEmail(norm)) {
    return { ok: false, reason: "invalid-email" };
  }

  await db.member.update({
    where: { id: me.id },
    data: {
      email: norm || null,
      emailVerifiedAt: norm ? new Date() : null,
    },
  });

  return { ok: true };
}
