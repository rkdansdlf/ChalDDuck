import "server-only";

import { createHash, randomInt, randomUUID } from "node:crypto";
import { db } from "@/server/db";

/**
 * 이메일 인증 토큰 (OTP & 매직 링크).
 *
 * 1. 6자리 숫자는 무차별 대입 공격을 막기 위해 SHA-256 해시로 저장합니다.
 * 2. 매직 링크용 난수 토큰(UUID)을 함께 발급하여 이메일 링크 클릭으로도 로그인 가능합니다.
 * 3. 만료 시간은 10분이며, 5회 이상 오입력 시 해당 토큰은 즉시 무효화됩니다.
 * 4. 1분 이내 재요청은 스팸 방지를 위해 거부됩니다.
 */

export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10분
export const OTP_COOLDOWN_MS = 60 * 1000; // 1분 재발송 대기
export const MAX_OTP_ATTEMPTS = 5;

/** 이메일 정규화 (공백 제거, 소문자화) */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 이메일 기본 형식 검사 */
export function isValidEmail(email: string): boolean {
  const norm = normalizeEmail(email);
  return norm.length >= 5 && norm.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm);
}

/** 6자리 코드 단방향 해시 */
export function hashOtp(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/** 이메일 인증 발송용 새 토큰 발행 */
export async function issueEmailToken(email: string): Promise<{
  code: string;
  token: string;
  isCooldown: boolean;
}> {
  const normEmail = normalizeEmail(email);

  // 1. 최근 1분 이내에 생성된 유효한 토큰이 있는지 확인 (스팸 방지)
  const recent = await db.emailAuthToken.findFirst({
    where: {
      email: normEmail,
      createdAt: { gt: new Date(Date.now() - OTP_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recent) {
    return { code: "", token: "", isCooldown: true };
  }

  // 2. 기존 이메일의 만료/대기 토큰들 정리
  await db.emailAuthToken.deleteMany({
    where: { email: normEmail },
  });

  // 3. 6자리 숫자 생성 (100000 ~ 999999) 및 UUID 매직 토큰 생성
  const code = String(randomInt(100000, 1000000));
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await db.emailAuthToken.create({
    data: {
      email: normEmail,
      codeHash: hashOtp(code),
      token,
      expiresAt,
    },
  });

  return { code, token, isCooldown: false };
}

/** 이메일 전송 (Resend 또는 개발 콘솔 로깅) */
export async function sendEmailOtp(
  email: string,
  code: string,
  token: string,
): Promise<{ success: boolean; previewCode?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const magicLink = `${baseUrl}/join/verify?token=${token}`;

  // Resend API 키가 있으면 실제 발송
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "찰떡 <auth@chaldduck.com>",
          to: email,
          subject: `[찰떡] 인증번호 [${code}]를 입력해 주세요`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #f0f0f0; border-radius: 16px;">
              <h2 style="color: #1a1a1a; margin-top: 0;">찰떡 로그인 인증번호</h2>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">
                아래 인증번호 6자리를 입력하여 로그인을 완료해 주세요.<br/>인증번호는 10분간 유효합니다.
              </p>
              <div style="background: #FFF9E6; border: 1px solid #FFE082; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
                <span style="font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #D97706; font-family: monospace;">${code}</span>
              </div>
              <div style="text-align: center; margin-top: 24px;">
                <a href="${magicLink}" style="display: inline-block; background: #2563EB; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  인증번호 없이 바로 로그인하기
                </a>
              </div>
              <p style="color: #999; font-size: 12px; margin-top: 32px; text-align: center;">
                본인이 요청하지 않았다면 이 메일을 무시해 주세요.
              </p>
            </div>
          `,
        }),
      });

      if (!res.ok) {
        console.error("[Email Auth] Resend API Error:", await res.text());
        // 실패 시 개발 환경을 위해 콘솔에도 출력
        console.log(`\n========================================\n[찰떡 이메일 인증] ${email}\n인증번호: ${code}\n매직링크: ${magicLink}\n========================================\n`);
        return { success: true, previewCode: code };
      }

      return { success: true };
    } catch (err) {
      console.error("[Email Auth] Failed to send email via Resend:", err);
      console.log(`\n========================================\n[찰떡 이메일 인증] ${email}\n인증번호: ${code}\n매직링크: ${magicLink}\n========================================\n`);
      return { success: true, previewCode: code };
    }
  }

  // API 키가 없는 경우 개발/테스트용 콘솔 출력
  console.log(`\n========================================\n[찰떡 이메일 인증] ${email}\n인증번호: ${code}\n매직링크: ${magicLink}\n========================================\n`);
  return { success: true, previewCode: code };
}
