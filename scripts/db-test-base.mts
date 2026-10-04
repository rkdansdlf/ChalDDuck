import "./load-env.mjs";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
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
 * - **한 번에 하나만 돈다.** 같은 로컬 DB 를 두 실행이 동시에 만지면 **조용히 틀린다** —
 *   아래 `claimDbLock` 이 그 이유를 갖고 있다.
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

/** 검사 하나가 쓰는 DB. 두 스위치는 같은 로컬 DB 를 본다 — 그래서 아래 락으로 직렬화한다. */
export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * **같은 로컬 DB 를 두 실행이 동시에 만지면 검사가 조용히 틀린다.**
 *
 * ## 실제로 겪은 실패
 *
 * 두 개를 겹쳐 돌렸을 때 회의 확정 검사 여섯 개가 동시에 깨졌다. 원인은 성립이 아니라
 * **상대 실행이 내 픽스처를 지웠다**는 것이었다. `smoke.mts` 의 회의 제안 검사는 팀 전체의
 * 제안을 `deleteMany({ where: { teamId } })` 로 치우는데, 그 팀은 두 실행이 **공유한다**
 * (`findFirst({ orderBy: { createdAt: "asc" } })` 는 가장 오래된 팀을 준다).
 *
 * ## 왜 테스트 전용 팀을 만들지 않기로 했는가
 *
 * 팀을 갈라놓는 것으로는 **안 된다.** 회의 확정 예약 작업이 **전 팀을 스캔**한다
 * (`confirm-due.ts` 의 `where: { stage: "proposed", respondBy: { lte: now } }` — 팀
 * 필터가 없다). 그래서 상대 실행이 만든 만료된 제안을 **내 실행이 뒤집어 버린다.**
 * 알림 개수도 `kind` 와 본문 문자열로 전역에서 세므로 팀과 상관없이 섞인다.
 *
 * 테스트 전용 팀을 만들려면 픽스처를 전부 갈아야 하고, 그래도 전역 스캔은 남는다.
 * **직렬화가 더 작고 더 확실하다** — 전역 스캔·전역 카운트·전역 정리가 한 번에 해결된다.
 * 남는 비용은 느려지는 것뿐이고, 그것은 "검사가 틀리는 것"보다 싸다.
 *
 * ## 왜 전용 연결을 쓰는가
 *
 * 어드바이저리 락은 **세션** 단위다. 풀링된 연결 위에서 잡으면 그 연결이 회수될 때
 * 조용히 풀린다. 그래서 락 전용 클라이언트를 하나 열어 **프로세스 수명 동안 붙잡는다.**
 */
const LOCK_KEY = 4_107_213_901;

async function claimDbLock() {
  const lock = new pg.Client({ connectionString });
  await lock.connect();
  const deadline = Date.now() + 10 * 60 * 1000;
  let announced = false;
  for (;;) {
    const got = await lock.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (got.rows[0]?.ok) {
      if (announced) console.log("  · 앞선 실행이 끝나서 이어서 돕니다");
      return lock;
    }
    if (Date.now() > deadline) {
      throw new Error("다른 불변식 확인이 10분째 DB 를 잡고 있습니다 — 먼저 끝나길 기다리세요.");
    }
    if (!announced) {
      // **대기 중이라는 사실을 말한다.** 조용히 멈춘 검사는 멈춘 것처럼 보인다.
      console.log("  · 다른 불변식 확인이 DB 를 쓰고 있습니다 — 끝나면 이어서 돕니다");
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const lock = await claimDbLock();

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
 * **자기 팀을 만들어** 검사 하나가 쓰게 한다. 마지막에 지운다.
 *
 * ## 왜 있는가 — 2026-09-28
 *
 * 예전에는 검사마다 이렇게 팀을 얻었다 —
 *
 * ```ts
 * const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
 * ```
 *
 * **DB 에 이미 있는 팀**이다. 그것이 세 가지 문제를 만들었다 —
 *
 * 1. **두 실행이 부딪힌다.** 이 스위치는 DB 를 잡는 어드바이저리 락이 있어서 원래는 직렬화돼야 했다.
 *    그런데 검사들이 **`.mjs` 사본**(잠금이 없는 것)을 불러 오고 있어서 **직렬화가 통하지
 *    않았다** — 게이트가 두 번 거짓말했다. 그 사본을 지우면 이 락이 실제로 걸린다.
 * 2. **시드 팀을 오염시킨다.** 회의 제안·슬롯·알림을 그 팀에 직접 만들어 두고, 아무도 지우지
 *    않는다. 개발자가 `db:seed` 를 다시 해도 남는다.
 * 3. **격리가 없다.** 시드가 바뀌면 여기 쓰는 검사들이 함께 바뀐다 — 무엇이 망가졌는지 알 수
 *    없다.
 *
 * 그래서 각 검사는 **자기 팀**을 쓰고 여기서 한 번에 치운다. `scripts/harness/` 의 `makeTeam`
 * 과 같은 관용구다.
 *
 * ## 멤버는 왜 세 명인가
 *
 * 두 명이면 "다른 사람이 막혔다" 를 볼 수 없다. 세 명이면 팀장 1 + 동료 2 이고, 실제 화면에서
 * 나올 수 있는 최소 구성이 된다. 호출자가 원하는 수를 넘길 수 있다.
 */
export type IsolatedTeam = {
  team: { id: string; name: string; code: string; course: string; menuPick?: string | null };
  /** 팀장. `isLeader` 가 **켜져 있다** — 다른 규칙이 이 값을 읽는다. */
  leader: { id: string; name: string };
  /** 동료 1 · 2. 순서대로 넣는다. */
  mates: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string; isLeader: boolean }>;
};

const isolatedTeams: string[] = [];

export async function makeIsolatedTeam(
  label: string,
  opts: { mates?: number; course?: string } = {},
): Promise<IsolatedTeam> {
  const mateCount = opts.mates ?? 2;
  const team = await db.team.create({
    data: {
      name: `검사 ${label}`,
      course: opts.course ?? "검증",
      code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
    },
  });
  isolatedTeams.push(team.id);

  const leader = await db.member.create({
    data: { teamId: team.id, name: "김민준", isLeader: true },
  });
  const mateNames = ["이서연", "박도윤", "최지우", "정하은"];
  const mates = [];
  for (let i = 0; i < mateCount; i += 1) {
    mates.push(
      await db.member.create({
        data: { teamId: team.id, name: mateNames[i % mateNames.length]! },
      }),
    );
  }

  const members = [leader, ...mates].map((m) => ({
    id: m.id,
    name: m.name,
    isLeader: m.id === leader.id,
  }));
  return {
    team,
    leader: { id: leader.id, name: leader.name },
    mates: mates.map((m) => ({ id: m.id, name: m.name })),
    members,
  };
}

/** 이 스위치가 만든 팀을 지운다. 검사가 중간에 죽어도 남지 않게 `finish()` 에서 부른다. */
async function dropIsolatedTeams(): Promise<void> {
  if (isolatedTeams.length === 0) return;
  const ids = isolatedTeams.splice(0, isolatedTeams.length);
  try {
    await db.team.deleteMany({ where: { id: { in: ids } } });
  } catch (cause) {
    // 못 지워도 검사를 실패시키지 않는다 — 남은 팀은 `makeIsolatedTeam` 이 매번 다른
    // `code` 를 만들므로 다음 실행에 영향을 주지 않는다.
    console.error(`[db-test-base] 검사용 팀 ${ids.length}개를 지우지 못했습니다`, cause);
  }
}

/**
 * 이 스위치를 마치고 요약한다. **파일 맨 끝에서 한 번만** 부른다.
 *
 * 성공이면 그대로 끝나고, 실패가 하나라도 있으면 1 로 끝난다 — 그래야 `package.json` 의
 * `&&` 가 뒤 스위치를 아예 부르지 않고, **`smoke.mts` 가 깨졌다고 `smoke-join.mts` 가
 * 초록불로 보이지 않는다.**
 */
export async function finish(): Promise<void> {
  // **자기 팀을 먼저 치운다** — 검사가 만든 흔적이 남지 않게. `db` 를 닫기 전에 해야 한다.
  await dropIsolatedTeams();
  await db.$disconnect();
  // 락을 먼저 풀고 — 풀지 않으면 이 프로세스가 끝날 때까지 뒤의 실행이 서 있게 된다.
  await lock.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
  await lock.end();
  console.log(`\n${failed === 0 ? "모두 통과" : `${failed}건 실패`} — ${passed}건 통과, ${failed}건 실패`);
  if (failed > 0) process.exit(1);
}
