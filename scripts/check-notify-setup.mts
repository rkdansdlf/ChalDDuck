import "../scripts/load-env.mjs";

import { createPrivateKey, createPublicKey } from "node:crypto";

import { configuredMailer } from "../src/server/auth/mailer.js";
import { appBaseUrl } from "../src/server/auth/email-token.js";
import { pushConfigured } from "../src/server/notify/push.js";

/**
 * 알림 설정이 **실제로 발송될 상태인지**를 확인한다 — 코드는 고치지 않고 사실만 말한다.
 *
 * ## 왜 이 파일이 있는가
 *
 * 2026-09-30 기준, 운영에서 푸시 구독은 **0건**이었다. 한 번도 켜본 적이 없다. 그런데 화면은
 * "알림을 켜세요"라고 말하고 있었다. 기기에서 시험하기 전에 알 수 있어야 하는 것이 세 가지다.
 *
 * 1. **VAPID 키가 짝이 맞는지.** 공개키와 개인키가 짝이 아니면 발송이 **조용히** 실패한다 —
 *    구독은 저장되고 화면은 "켜짐"이라고 말하는데 아무것도 오지 않는다.
 * 2. **메일이 나가는 길이 있는지.** 발신 수단이 없으면 인증번호가 안 나가고, 그 사실은
 *    로그에만 남는다.
 * 3. **메일에 찍히는 주소가 어디인지.** `localhost` 가 박히면 사용자는 **"도착했는데 안 된다"**
 *    를 보게 되고 원인을 더 헤매게 만든다.
 *
 * 이 셋 중 어느 것도 화면에 드러나지 않는다. 그래서 기기를 빌드 보기 전에 여기서 본다.
 *
 * ## 왜 `verify` 에 넣지 않는가
 *
 * 이 검사는 **환경에 의존한다.** 로컬에서 통과해도 운영에서 통과할 이유가 없고, 그 반대도
 * 같다. 게이트(`npm run verify`)는 "이 커밋이 배포될 수 있는가"를 말하는 자리가므로,
 * 환경 확인을 요구하는 자리가 아니다. 다른 확인 스크립트와 같은 위치에 두되 **따로 부른다.**
 *
 * ## 사용법
 *
 * ```bash
 * npm run notify:check                       # 이 환경(기본은 로컬 개발 DB)
 * DIRECT_URL=<운영 주소> npm run notify:check  # 운영을 보려면 주소를 직접 준다
 * ```
 *
 * `scripts/load-env.mjs` 가 `.env.development.local` 을 먼저 읽으므로 **기본은 언제나 로컬
 * DB** 다. 운영을 보려면 주소를 명시해야 하고, 그 의도는 코드에 남지 않는다.
 */

/** 이 검사가 통과했는지. 1 로 끝나면 이어지는 작업을 멈춘다 — 가짜 성공이 나중 사고다. */
let problems = 0;

function ok(what: string) {
  console.log(`  ✓ ${what}`);
}

function bad(what: string, detail: string) {
  problems += 1;
  console.log(`  ✗ ${what}\n      ${detail}`);
}

function line(what: string) {
  console.log(`\n${what}`);
}

/**
 * **확인하지 못한 것**과 **잘못된 것**을 반드시 다르게 말한다.
 *
 * 이 구분이 없으면 이 도구는 거짓말을 한다. 실제로 겪었다: `vercel env pull` 은 Secret 값을
 * `[SENSITIVE]` 라는 **자리표시자**로 대신 적는다. 그 상태에서 키를 검사하면 "공개키와 개인키가
 * 짝이 아니다" 라고 **보고**하는데, 진짜 사실은 **"알 수 없다"** 다. 문제가 아닌 것을 문제로
 * 말하면, 사람이 이 도구를 신뢰하지 않게 되고 — 그때 진짜 문제를 못 믿게 된다.
 *
 * 그래서 값이 자리표시자면 **확인하지 못한 것으로** 보고하고, 실패로 세지 않는다.
 */
function isPlaceholder(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return v === "" || v === "[SENSITIVE]" || v.startsWith("[SENSITIVE]");
}

/** 확인하지 못한 것을 말한다. **실패로 세지 않는다** — 그게 요점이다. */
function unknown(what: string, how: string) {
  console.log(`  · ${what} — 확인하지 못했다 (${how})`);
}

/**
 * base64url 한 줄. `Buffer` 의 내장 인코딩을 쓴다.
 *
 * 직접 `replace` 로.base64 를 뒤집어 적으면 **`/` 를 `_` 로 바꾸는 한 글자**에서 조용히
 * 틀린다 — 실제로 이 파일을 쓰기 전에 그랬다. 그래서 표준에 있는 것을 쓴다.
 */
function toBytes(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/**
 * VAPID 개인키가 그 공개키의 짝인가.
 *
 * **비교하는 방식** — 개인키로부터 공개키를 **다시 유도해** 물어본다. 키 두 개가 같은 형식
 * (65바이트 점, 32바이트 스칼라)인지 보는 것은 아무것도 증명하지 못한다. **짝이 맞지 않으면
 * 발송이 조용히 실패**하는데 그 모양은 형식이 아무리 멀쩡해도 똑같아 보이기 때문이다.
 *
 * 공개키는 압축하지 않은 점이라 `0x04 || X(32) || Y(32)` 다. `Y` 만 남기고 `X` 를 버리는
 * 곡선의 성질로 **공개키는 개인키에서 유도된다** — 그래서 유도 결과를 X·Y 양쪽과 비교하면
 * "이 둘이 정말 한 쌍인가"가 답해진다.
 */
function vapidPairMatches(publicKey: string, privateKey: string): { ok: boolean; why: string } {
  let pub: Buffer;
  let priv: Buffer;
  try {
    pub = toBytes(publicKey);
    priv = toBytes(privateKey);
  } catch {
    return { ok: false, why: "키가 base64url 이 아니다" };
  }

  if (pub.length !== 65 || pub[0] !== 0x04) {
    return { ok: false, why: `공개키 형식이 이상하다 (${pub.length}바이트, 첫 바이트 0x${pub[0]?.toString(16)})` };
  }
  if (priv.length !== 32) {
    return { ok: false, why: `개인키 형식이 이상하다 (${priv.length}바이트)` };
  }

  const x = pub.subarray(1, 33).toString("base64url");
  const y = pub.subarray(33, 65).toString("base64url");

  let derived: { x?: string; y?: string };
  try {
    // Node 의 JWK 는 EC 개인키에 x·y 를 함께 요구한다. **x·y 를 여기서 주는 것은
    // "이 개인키가 그 공개키의 짝이다"를 **주장하는 것**이 아니라 형식 채우기다 — 아래에서
    // 유도 결과와 직접 비교해 확인한다.
    const privKey = createPrivateKey({
      key: { kty: "EC", crv: "P-256", d: priv.toString("base64url"), x, y, ext: true },
      format: "jwk",
    });
    derived = createPublicKey(privKey).export({ format: "jwk" }) as { x?: string; y?: string };
  } catch (cause) {
    return { ok: false, why: `개인키를 읽지 못했다 (${(cause as Error).message})` };
  }

  if (derived.x === x && derived.y === y) return { ok: true, why: "" };
  return {
    ok: false,
    why: "공개키가 그 개인키에서 나오지 않는다 — 두 값이 **짝이 아니다**",
  };
}

console.log("알림 설정 확인");
console.log("  (어떤 환경을 보는지는 아래 '어느 주소로 보는가' 에서 말합니다)");

/* ── VAPID ─────────────────────────────────────────────────────── */

line("푸시 키 (VAPID)");
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";

if (!publicKey && !privateKey) {
  // **없는 것은 설정 실수가 아니다** — 아직 켜지기로 한 곳이 없는 상태다. 검사를 실패시키면
  // "없는 게 정상" 인 상태를 못 쓰는 게 되어, 실제로는 꼭 필요한 곳에 이 검사를 놓지 않게 된다.
  ok("키가 없다 — 이 환경에서는 푸시를 켤 수 없다 (설정 실수가 아니다)");
} else if (isPlaceholder(privateKey)) {
  unknown("키가 짝인지", "개인키가 자리표시자다 — 운영 값은 Vercel 이 주지 않는다. 기기에서 직접 시험해야 한다");
} else if (!publicKey || !privateKey) {
  bad("키가 반쪽만 있다", `${!publicKey ? "NEXT_PUBLIC_VAPID_PUBLIC_KEY" : "VAPID_PRIVATE_KEY"} 가 없다 — 둘 다 있어야 발송한다`);
} else {
  ok("공개키와 개인키가 모두 있다");
  const pair = vapidPairMatches(publicKey, privateKey);
  if (pair.ok) ok("공개키가 그 개인키의 짝이다");
  else bad("공개키와 개인키가 짝이 아니다", `${pair.why} — 구독은 저장되지만 **발송이 조용히 실패**한다`);
  ok(`발신 준비 판정: ${pushConfigured() ? "켜져 있다" : "꺼져 있다"}`);
}
if (isPlaceholder(process.env.VAPID_SUBJECT)) {
  unknown("발신자로 보이는 값", "VAPID_SUBJECT 가 자리표시자다");
} else {
  ok(`발신자로 보이는 값: ${process.env.VAPID_SUBJECT || "(없음 — 기기가 '알 수 없는 발신자'로 보여 조용히 버릴 수 있다)"}`);
}

/* ── 메일 ──────────────────────────────────────────────────────── */

line("메일 발송");
const mailer = configuredMailer();
if (mailer === "gmail") ok("발신 수단: gmail");
else if (mailer === "resend") ok("발신 수단: resend");
else
  bad(
    "발신 수단이 없다",
    "Vercel 환경변수에 GMAIL_USER · GMAIL_APP_PASSWORD(무료) 또는 RESEND_API_KEY 를 넣어야 한다 — 없으면 인증번호가 안 나간다",
  );

/* ── 링크가 갈 주소 ────────────────────────────────────────────── */

line("어느 주소로 보는가");
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
// **주소를 바로 파싱하지 않는다.** 값이 비었거나 `vercel env pull` 의 자리표시자여도 **이 검사는
// 죽으면 안 된다** — 죽은 검사는 "확인하지 못했다" 와 "문제가 없다" 를 구분하지 못하게 만든다.
let host: string | null = null;
if (!connectionString) {
  bad("DB 주소가 없다", "DIRECT_URL 또는 DATABASE_URL 이 없다 — 발송 경로는 여기서 끝난다");
} else {
  try {
    host = new URL(connectionString).hostname;
    ok(`DB: ${host}`);
  } catch {
    unknown("DB 주소", `값이 주소 모양이 아니다 (${connectionString.slice(0, 24)}…)`);
  }
}
ok(`푸시 발송 경로: ${process.env.OPENROUTER_KEY ? "있음" : "없음 — AI 기능이 조용히 실패한다"}`);line("메일 링크가 갈 주소");
const base = appBaseUrl();
const isProd = host !== null && ![...["", "localhost", "127.0.0.1", "::1"]].includes(host) && host.includes(".");
const source = process.env.APP_URL
  ? "APP_URL"
  : process.env.NEXT_PUBLIC_APP_URL
    ? "NEXT_PUBLIC_APP_URL (옛 이름)"
    : process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? "VERCEL_PROJECT_PRODUCTION_URL (Vercel 이 박아 둔 배포 주소)"
      : base.startsWith("http://localhost")
        ? "localhost — **운영이 아니라면 정상**"
        : "알 수 없음";

if (base.startsWith("http://localhost")) {
  // **운영에서 여기로 떨어지면 문제가 된다.** 로컬 개발에서 여기가 정답이므로 같은 문장으로
  // 말하면 안 된다 — 매번 실패하는 도구를 쓰게 만들면 결국 안 쓰게 된다.
  if (isProd || process.env.VERCEL_ENV === "production") {
    bad("운영인데 링크가 localhost 로 간다", `받는 사람은 도착한 링크를 열 수 없다 (${base})`);
  } else {
    ok(`링크 주소: ${base}  — 로컬 개발이므로 정상입니다`);
  }
} else {
  ok(`링크 주소: ${base}`);
}
ok(`어디서 왔나: ${source}`);



// **어느 환경인지 를 추측하지 않는다.** DB 주소를 못 읽었으면 그건 "개발" 이 아니라
// "알 수 없다" 다 — 개발이라고 말하면 로컬에서 돌린 사람이 운영이라고 착각한다.
const where = host === null ? "어느 환경인지 확인하지 못했다 (DB 주소를 못 읽었다)" : isProd ? "운영" : "개발";
console.log(
  problems === 0
    ? `\n이상 없음 — ${where} 환경 기준입니다.`
    : `\n${problems}건 — 고친 뒤에 기기를 빌 보기 전에 다시 돌리세요. (${where})`,
);
if (problems > 0) process.exit(1);
