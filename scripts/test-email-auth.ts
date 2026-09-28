import { config } from "dotenv";
config({ path: [".env.development.local", ".env"], override: true });

import assert from "node:assert";
import { db } from "../src/server/db";
import {
  hashOtp,
  isValidEmail,
  issueEmailToken,
  normalizeEmail,
} from "../src/server/auth/email-token";
import {
  verifyEmailAuthCode,
} from "../src/server/actions/email-auth";

async function runTests() {
  console.log("🧪 [Email Auth] 자동화 검증 시작...");

  // 1. 이메일 유효성 검증
  console.log("1. 이메일 유효성 및 정규화 검증...");
  assert.strictEqual(normalizeEmail("  Test@Example.COM "), "test@example.com");
  assert.strictEqual(isValidEmail("test@example.com"), true);
  assert.strictEqual(isValidEmail("invalid-email"), false);
  assert.strictEqual(isValidEmail("@no-user.com"), false);
  console.log("  ✅ 통과");

  // 2. 해시 일치 검증
  console.log("2. 6자리 OTP 단방향 해시 검증...");
  const code = "123456";
  const hash1 = hashOtp(code);
  const hash2 = hashOtp(" 123456 ");
  assert.strictEqual(hash1, hash2);
  assert.notStrictEqual(hash1, hashOtp("654321"));
  console.log("  ✅ 통과");

  // 3. 토큰 발급 및 DB 저장 검증
  console.log("3. 토큰 발급 및 DB 저장 검증...");
  const testEmail = "automated-test@univ.ac.kr";
  await db.emailAuthToken.deleteMany({ where: { email: testEmail } });

  const { code: issuedCode, token, isCooldown } = await issueEmailToken(testEmail);
  assert.strictEqual(isCooldown, false);
  assert.strictEqual(issuedCode.length, 6);
  assert.strictEqual(typeof token, "string");

  const record = await db.emailAuthToken.findFirst({ where: { email: testEmail } });
  assert.ok(record, "DB에 토큰 레코드가 저장되어야 합니다");
  assert.strictEqual(record.codeHash, hashOtp(issuedCode));
  console.log("  ✅ 통과");

  // 4. 1분 쿨다운 (스팸 방지) 검증
  console.log("4. 1분 쿨다운(스팸 방지) 검증...");
  const retry = await issueEmailToken(testEmail);
  assert.strictEqual(retry.isCooldown, true, "1분 이내 재요청은 쿨다운이 걸려야 합니다");
  console.log("  ✅ 통과");

  // 5. 잘못된 번호 입력 시 시도 횟수 차감 검증
  console.log("5. 오입력 카운트 및 5회 잠금 검증...");
  const wrongRes1 = await verifyEmailAuthCode(testEmail, "000000");
  assert.strictEqual(wrongRes1.status, "wrong");
  if (wrongRes1.status === "wrong") {
    assert.strictEqual(wrongRes1.remainingAttempts, 4);
  }

  // 4회 더 틀리기
  await verifyEmailAuthCode(testEmail, "000000");
  await verifyEmailAuthCode(testEmail, "000000");
  await verifyEmailAuthCode(testEmail, "000000");
  const lockRes = await verifyEmailAuthCode(testEmail, "000000");
  assert.strictEqual(lockRes.status, "locked", "5회 오입력 시 잠금 처리되어야 합니다");
  console.log("  ✅ 통과");

  // 정리
  await db.emailAuthToken.deleteMany({ where: { email: testEmail } });

  console.log("\n🎉 [Email Auth] 모든 핵심 로직 검증 100% 통과!\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
