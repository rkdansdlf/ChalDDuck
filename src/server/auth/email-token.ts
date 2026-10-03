import "server-only";

import { createHash, randomInt, randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { sendMail } from "@/server/auth/mailer";
import { undelivery } from "@/server/auth/undelivered";

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

/**
 * 이메일에 찍을 우리 주소(매직 링크의 기준점).
 *
 * **내보내는 이유** — 이 함수의 계산 순서가 곧 "운영 메일이 어디로 가는지" 다
 * (`APP_URL` → Vercel 이 박아 둔 배포 주소 → `localhost`). 그 순서를 **복사본으로 다시 적으면
 * 검사가 실제 코드를 검사하지 않게 된다.** 그래서 진단 도구(`scripts/check-notify-setup.mts`)
 * 는 이 함수를 불러 쓴다 — 같은 계산을 두 번 하지 않는다.
 *
 * ⚠️ **예전에는 `NEXT_PUBLIC_APP_URL` 만 봤다 — 그게 이 문제의 절반이었다.**
 * `NEXT_PUBLIC_` 접두사는 **빌드 시점에 값이 인라인되어 동결**된다
 * (next/dist/docs/01-app/02-guides/environment-variables.md). 그래서 Vercel 대시보드에서
 * 나중에 채워도 **재빌드 전까지는 코드에 박힌 옛값(또는 폴백)이 그대로 쓰인다.** 서버
 * 전용이라 빌드 시점에 굳힐 이유가 없던 값이므로 `APP_URL` 을 우선하고, `NEXT_PUBLIC_` 는
 * 옛 이름이라 두 번째로만 본다.
 *
 * 그래도 비어 있으면 Vercel 이 스스로 박아 둔 값으로 메운다 — `VERCEL_PROJECT_PRODUCTION_URL`
 * 은 그 프로젝트의 운영 주소(커스텀 도메인 포함)이고, 프리뷰 배포에서는 그 배포 주소
 * (`VERCEL_URL`)가 맞다. 즉 **환경변수를 따로 심지 않아도 배포 주소는 자동으로 잡힌다.**
 * 마지막 `localhost` 폴백은 로컬 개발을 위한 것이고, 운영에서 여기까지 내려왔다면 아래
 * `undelivered` 가 조용히 실패하지 않도록 경고로 드러낸다.
 */
export function appBaseUrl(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // 운영 배포면 배포 주소를, 프리뷰면 그 배포 고유 주소를 쓴다.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // 여기까지 내려왔다는 건 배포 주소를 어디에서도 못 찾아냈다는 뜻이다. 로컬 개발에서는
  // 당연한 일이지만, 운영에서 이 값이 그대로 메일에 박히면 도착한 메일의 로그인 버튼이
  // 전부 `localhost` 를 가리킨다 — 메일은 "도착했는데 안 된다"가 되어 원인을 더 헤매게 만든다.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[Email Auth] 앱 주소(APP_URL)를 결정하지 못해 매직 링크가 http://localhost:3000 이 됩니다. " +
        "Vercel 환경변수에 APP_URL 을 넣으세요.",
    );
  }

  return "http://localhost:3000";
}

/**
 * 이메일이 나가지 않았을 때의 결과.
 *
 * **정책은 `server/auth/undelivered.ts` 에 있고 여기서는 그것을 불러 로그를 찍기만 한다.**
 * 판단을 두 군데에 두면 어느 한쪽이 나중에 뒤처진다 — 그래서 발송 경로가 Gmail·Resend 둘로
 * 늘었어도(지금 두 개다) 이 한 곳만 고치면 된다.
 */
function undelivered(
  email: string,
  magicLink: string,
  code: string,
  reason: string,
): { success: boolean; previewCode?: string } {
  const { result, line } = undelivery(process.env.NODE_ENV === "production", reason, {
    email,
    magicLink,
    code,
  });

  if (process.env.NODE_ENV === "production") console.error(line);
  else console.log(line);

  return result;
}

/**
 * 인증번호 메일 발송.
 *
 * **내용(인증번호·매직 링크)은 여기서 만들고, 실제로 내보내는 일은 `mailer` 가 한다.**
 * 어느 경로(Gmail / Resend)로 나가는지는 메일러가 환경변수로 정한다 — 도메인이 없어서
 * 경로가 두 개가 되었지만, 이 함수는 그 차이를 모른다.
 *
 * @see `server/auth/mailer.ts` — 경로가 왜 둘인지, 각각 무엇을 요구하는지
 */
export async function sendEmailOtp(
  email: string,
  code: string,
  token: string,
): Promise<{ success: boolean; previewCode?: string }> {
  const magicLink = `${appBaseUrl()}/join/verify?token=${token}`;

  const sent = await sendMail({
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
  });

  if (sent.ok) return { success: true };

  return undelivered(email, magicLink, code, sent.reason);
}
