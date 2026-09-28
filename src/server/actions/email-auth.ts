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
import { sendSupabaseOtp, verifySupabaseOtp } from "@/server/auth/supabase";

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
  | { ok: false; reason: "invalid-email" | "cooldown" | "error" };

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

/** 이메일로 6자리 인증번호 및 매직링크 요청 */
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

    // 1. Supabase Auth를 통해 실제 사용자 이메일로 6자리 OTP 발송
    const supabaseRes = await sendSupabaseOtp(norm);

    // 2. 개발 환경 또는 백업용 메일러/콘솔 로깅 병행
    const { previewCode } = await sendEmailOtp(norm, code, token);

    // Supabase 발송이 실패했을 때 콘솔 경고 남김
    if (!supabaseRes.success) {
      console.warn("[Email Auth] Supabase 발송 경고:", supabaseRes.error);
    }

    return { ok: true, previewCode };
  } catch (err) {
    console.error("[Email Auth] requestEmailAuth error:", err);
    return { ok: false, reason: "error" };
  }
}

/** 6자리 인증번호 검증 및 로그인 처리 */
export async function verifyEmailAuthCode(
  email: string,
  code: string,
): Promise<EmailVerifyResult> {
  const norm = normalizeEmail(email);
  const cleanCode = code.trim();

  if (!isValidEmail(norm) || cleanCode.length !== 6) {
    return { status: "wrong", remainingAttempts: MAX_OTP_ATTEMPTS };
  }

  // 1. Supabase Auth로 사용자가 메일로 받은 6자리 OTP 실제 검증 시도
  const supabaseVerify = await verifySupabaseOtp(norm, cleanCode);
  if (supabaseVerify.success) {
    // Supabase 인증 성공 시 로컬 대기 토큰도 정리 후 즉시 로그인 완료
    await db.emailAuthToken.deleteMany({ where: { email: norm } });
    return completeEmailLogin(norm);
  }

  // 2. 로컬 백업 토큰 검증 (개발 콘솔/테스트용 코드 입력 시)
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
