import "../scripts/load-env.mjs";

import { createHash } from "node:crypto";

import { db } from "../src/server/db.js";

/**
 * 푸시 구독 표를 그대로 보여 준다 — **기기 시험의 증인**.
 *
 * ## 왜 이 파일이 있는가
 *
 * 기기 시험은 사람이 "알림이 왔어요", "안 왔어요" 라고 말하며 끝난다. 그 말은 **증거가
 * 아니다.** 정말로 무엇이 일어났는지는 구독 표가 알고 있다. 2026-09-29 에 끄기가
 * `deleteMany({ memberId })` 이었을 때는 **노트북에서 끄고 휴대폰까지 사라졌는데**, 화면은
 * "껐습니다"라고 말했고 아무도 그 차이를 볼 수 없었다. **보는 곳이 없으면 차이는 없다.**
 *
 * 이 파일은 그 "보는 곳"이다. 시험 각 단계 뒤에 돌리면 무엇이 일어났는지 말해 준다.
 *
 * ## 읽기만 한다 — 고치지 않는다
 *
 * 시험 중에 표를 손보면 "무엇이 효과가 있었나" 를 알 수 없다. 그래서 여기서는 `select` 뿐이다.
 * 정리(404·410 지운 줄)는 **발신 코드가** 알아서 한다 — 그게 맞는 자리다.
 *
 * ## 주소를 통째로 보여 주지 않는 이유
 *
 * 푸시 `endpoint` 는 **그 브라우저만 보낼 수 있는 주소**다(발신 암호화 키와 짝을 이뤄야 읽힌다).
 * 그래도 브라우저 안의 자격 증명이라 그대로 찍으면 곤란하다. 지문 8글자로 줄여 **같은 기기인지
 * 다른 기기인지만** 보이게 한다 — 시험에 필요한 정보는 그것뿐이다.
 *
 * ## 사용법
 *
 * ```bash
 * npm run push:subs                                   # 이 환경 (기본은 로컬 개발 DB)
 * DIRECT_URL=<운영 주소> npm run push:subs             # 운영을 보려면 주소를 직접 준다
 * DIRECT_URL=<운영 주소> npm run push:subs -- --watch  # 시험 중에 계속 본다
 * ```
 *
 * `scripts/load-env.mjs` 가 `.env.development.local` 을 먼저 읽으므로 **기본은 언제나 개발 DB**
 * 다. 운영을 보려면 주소를 명시해야 하고, 그 의도는 코드에 남지 않는다.
 */

/** 주소를 **보지 않고** 같은 기기인지만 구별한다. */
function fingerprint(value: string, length = 8): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

/** 사람이 읽는 상대 시각. 언제 등록됐는지가 이 시험에서 유일하게 중요한 시간이다. */
function kstOf(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

async function show(): Promise<void> {
  const rows = await db.pushSubscription.findMany({
    select: { memberId: true, endpoint: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    console.log("  구독 0건 — 아직 아무도 켠 적이 없다.");
    console.log("  알림 수신은 **이 순간 처음** 시험되는 중이다. 켜기 전 상태가 여기가 맞다.");
    return;
  }

  /** 사람별로 모은다. 한 사람이 기기를 몇 대 켜 두고 있는지가 이 시험의 숫자다. */
  const byMember = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  console.log(`  구독 ${rows.length}건 · 사람 ${byMember.size}명`);
  for (const [memberId, list] of byMember) {
    console.log(`\n  사람 ${fingerprint(memberId, 6)} — 기기 ${list.length}대`);
    for (const row of list) {
      console.log(
        `    기기 ${fingerprint(row.endpoint)}  ·  등록 ${kstOf(row.createdAt)}`,
      );
    }
  }
}

const watch = process.argv.includes("--watch");
const host = (() => {
  const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  try {
    return cs ? new URL(cs).hostname : "(없음)";
  } catch {
    return "(읽지 못함)";
  }
})();
const isProd = ![...["", "localhost", "127.0.0.1", "::1", "(없음)", "(읽지 못함)"]].includes(host);

console.log(`푸시 구독 — DB ${host}${isProd ? "  ← 운영이다. 읽기만 합니다." : " (개발)"}`);
console.log(watch ? "  (계속 봅니다. Ctrl+C 로 끝냅니다)\n" : "");

if (watch) {
  for (;;) {
    try {
      await show();
    } catch (cause) {
      console.log(`  읽지 못했다: ${(cause as Error).message.split("\n").pop()}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

try {
  await show();
} catch (cause) {
  console.log(`  읽지 못했다: ${(cause as Error).message.split("\n").pop()}`);
  process.exit(1);
} finally {
  await db.$disconnect();
}