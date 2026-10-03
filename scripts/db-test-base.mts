import "./load-env.mjs";

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { stripComments } from "./strip-comments.mjs";
import { PrismaClient } from "../src/generated/prisma/client.js";

/**
 * DB 불변식 확인의 **공통 기반** — 클라이언트·카운터·소스 읽기·마무리.
 *
 * ## 왜 이 파일이 있는가
 *
 * 불변식 확인은 두 개 파일로 나뉘어 있다.
 *
 * ```
 * scripts/db-test-base.mts   ← 여기. 클라이언트·check·truthy·readCode·summary
 * scripts/smoke.mts          ← 도메인 불변식 (읽기 순화, 회의, 푸시, AI 한도 …)
 * scripts/smoke-join.mts     ← 초대·가입 승인 불변식
 * ```
 *
 * 나뉘기 전에는 4884줄짜리 파일 하나에 전부 들어 있었다. 그 결과가 두 가지였다.
 *
 * **1. 다른 편집이 테스트를 지웠다.** 한 파일이 크면 그 안의 한 부분만 고치는 일조차
 * "파일 전체를 되쓰다"가 되기 쉽고, 그래서 **남의 테스트가 조용히 사라졌다.** 한 번은
 * 반복해서 겪었다. 사라진 테스트는 복구할 수 없다 — 그건 편집이 아니라 손실이다.
 *
 * **2. 무엇이 깨졌는지 한 번에 알 수 없었다.** 초대 검사 하나가 memberships 규칙
 * 검사와 같은 파일에 있으면, 초대만 고쳐도 회원이 깨졌을 때 서로를 의심하게 된다.
 *
 * 초대를 별도 파일로 꺼낸 것은 **더 큰 스위치를 먼저 넣으려고**다. 앞으로 스위치가 새로
 * 생겨도 스위치마다 파일 하나가 붙으면 서로를 물지 않는다.
 *
 * ## 이 기반이 지키는 것
 *
 * - **로컬 DB 에서만 돈다.** 시드와 같은 이유다(`load-env.mjs` 가 `.env.development.local`
 *   을 먼저 읽는다). 아래에서 다시 확인하므로 이 검사가 실수로 운영 DB 를 만져도 **검사가
 *   시작되지 않는다.**
 * - **주석을 지운 소스만 읽는다**(`readCode`). 형식 검사는 전부 이쪽을 쓴다.
 * - **실패하면 1 로 끝난다.** 두 파일이 각자 자기 파트로 따로 도므로, 한쪽이 죽어도 다른
 *   쪽의 결과는 살아 있다 — 그것이 분리한 목적이니까.
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL 이 없습니다.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`불변식 확인은 로컬 DB 에서만 돕니다. 지금은 ${host} 를 가리킵니다.`);
}

/** 검사 하나가 쓰는 DB. 두 스위치가 각자 같은 로컬 DB 를 본다 — 그래서 함께 도는 게 정상이다. */
export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failed = 0;
let passed = 0;

/**
 * 하나를 확인한다. 같으면 통과, 다르면 **기대와 실제 둘 다 찍고** 넘어간다 — 한 개가
 * 어긋났다고 그 뒤를 전부 멈추지 않는다. 어디까지 어긋났는지 한 화면에 있어야 고칠 수 있다.
 */
export function check(what: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    passed += 1;
    console.log(`  ✓ ${what}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${what}\n      기대: ${b}\n      실제: ${a}`);
  }
}

/** 참이어야 하는 것 하나. 기대값이 늘 `true` 인데 자리만 따로 두는 이유는 **글이 읽히기 때문**이다. */
export function truthy(what: string, got: boolean) {
  check(what, got, true);
}

/**
 * `check` 로는 표현할 수 없는 실패를 **직접** 쌓는다.
 *
 * "기대: X / 실제: Y" 로 설명할 수 없는 검사가 있다 — 목록 전체를 보여 주거나, 한 건의
 * 실패가 몇 개를 세는지 스스로 아는 경우다. 그런 검사는 `check` 를 억지로 부르면 메시지가
 * 거짓말을 한다.
 *
 * 그래서 스위치는 이쪽을 부르고 **메시지는 직접 찍는다.**
 */
export function fail(count = 1): void {
  failed += count;
}

/**
 * 소스를 읽되 **주석을 지운다** — 구조를 세는 검사는 전부 이쪽을 쓴다.
 *
 * ## 왜 하나뿐의 경로인가
 *
 * 화면을 실행할 수 없어 **소스 문자열에서 구조를 고정한다**(어떤 함수를 부르는가,
 * 몇 줄을 지나는가, 이 말을 쓰지 않는다). 그 대가로 두 가지가 씌어 있었고 둘 다 실제로
 * 잘못된 판정을 냈다.
 *
 * - **주석을 센다.** 2026-09-28: `actions/invite.ts` 의 액션 2개가 모두 팀장 검사를 하고
 *   있었는데 검사가 실패했다 — 16행 **주석**에 `requireLeader()` 라는 글자가 있어서 3개로
 *   센 것이었다.
 * - **조용히 다른 것을 검사한다.** 함수를 `indexOf` 로 찾으면 못 찾았을 때 `-1` 이 되고,
 *   그 뒤 슬라이스는 **다른 지점**이 된다. 컴파일은 통과하고 검사는 초록불이었다.
 *
 * 주석을 **공백으로 치환**하기 때문에 위치가 그대로다 — "A 가 B 보다 먼저 온다" 류의 순서
 * 검사가 의도대로 계속 동작한다. 자세한 내용은 [`scripts/strip-comments.mjs`](strip-comments.mjs).
 *
 * ⚠️ **`.ts`·`.tsx` 에만 쓴다.** 마크다운에 쓰면 URL 의 `//` 이 정규식으로 읽혀 글자가 지워진다.
 * 문서(`README.md`)는 `readFileSync` 를 그대로 쓴다.
 */
export function readCode(rel: string): string {
  return stripComments(readFileSync(new URL(rel, import.meta.url), "utf8"));
}

/**
 * 이 스위치를 마치고 요약한다. **파일 맨 끝에서 한 번만** 부른다.
 *
 * 성공이면 그대로 끝나고, 실패가 하나라도 있으면 1 로 끝난다 — 그래야 `package.json` 의
 * `&&` 가 뒤 스위치를 아예 부르지 않고, **`smoke.mts` 가 깨졌다고 `smoke-join.mts` 가
 * 초록불로 보이지 않는다.**
 */
export async function finish(): Promise<void> {
  await db.$disconnect();
  console.log(`\n${failed === 0 ? "모두 통과" : `${failed}건 실패`} — ${passed}건 통과, ${failed}건 실패`);
  if (failed > 0) process.exit(1);
}
