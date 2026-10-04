/**
 * 기여도 이견 — **"덮어쓰지 않는다" 를 실제로 부르는 코드로 증명한다.**
 *
 * ## 왜 하네스가 따로 필요한가
 *
 * `scripts/smoke.mts` 는 서버 액션을 **부르지 못한다** — 액션은 전부 쿠키가 필요해서
 * (`request-context.mjs` 머리말 참고) 부르면 "액션이 정상"이 아니라 "액션을 우회했다"는 사실만
 * 확인하게 된다. 여기는 그 우회 없이 **진짜 액션**을 부른다.
 *
 * ## 여기서 무엇을 지키나
 *
 * "한쪽 말로 덮지 않고 둘 다 남깁니다" 는 스키마 주석과 액션 주석, 그리고 decisions 목록이
 * 약속하는 사실이다. 그런데 그 보장을 확인하던 검사는 **DB 에 손으로 같은 쓰기를 두 번 해서**
 * 마지막에 이력을 읽었다 — 즉 **약속을 지킨 코드를 지켰다는 증거가 아니라, 같은 모양을 손으로
 * 만든 결과**였다. 액션에서 `contribDispute.create` 한 줄을 지워도 그 검사는 통과한다.
 *
 * 그래서 여기는 **액션 경로로** 두 번 달라 물어본다. 이게 깨지면 실제로 opinions 가 사라진다.
 *
 * ## 아직 없는 것 — 이 검사는 그 사실까지 말하지 않는다
 *
 * `ContribDispute` 는 **아무도 읽지 않는다.** 행은 쌓이지만 리포트도 화면도 그 이력을 보지
 * 않는다(`data/api.ts` 의 `unresolved` 는 `ContribRecord.dispute`/`resolution` 만 본다).
 * "남긴다" 는 **보관에 대한 사실**이지 **보여 준다는 약속이 아니다.** 누군가 그 이력을 보여 주면
 * 그것은 별개의 결정이다 — 특히 "철회" 문제가 함께 달려 있어서(아직 미결), 여기서는 건드리지
 * 않고 사실로만 남긴다.
 */
import { randomUUID } from "node:crypto";

import { db } from "@/server/db";

/** `scripts/smoke.mts` 가 쓰는 것과 같은 표 — 판정이 여기서 들추지 않게. */
type Session = { as(token: string): void; nobody(): void };

/** 리포트가 "정리되지 않은 의견" 으로 세는 결론 (`features/contrib/resolution.ts`). */
const NO_AGREEMENT = "합의 없음 · 원문 유지";

export async function run({ session }: { session: Session }): Promise<boolean> {
  let failed = 0;
  let passed = 0;
  function check(what: string, got: unknown, want: unknown): void {
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
  function truthy(what: string, got: boolean): void {
    check(what, got, true);
  }

  console.log("\n기여도 이견 — 앞선 의견이 남는다 (액션 경로)");

  const stamp = Date.now().toString(36);
  const team = await db.team.create({
    data: { name: `이견${stamp}`, code: `DH${stamp}`.toUpperCase(), course: "테스트" },
  });
  const [owner, other] = await Promise.all([
    db.member.create({
      data: { teamId: team.id, name: `기록주${stamp}`, mbti: "ISTJ", wantRole: "present" },
    }),
    db.member.create({
      data: { teamId: team.id, name: `이의자${stamp}`, mbti: "ENTP", wantRole: "clerk" },
    }),
  ]);
  const tokens = new Map<string, string>();
  for (const m of [owner, other]) {
    const t = randomUUID();
    await db.session.create({
      data: { token: t, memberId: m.id, expiresAt: new Date(Date.now() + 3600_000) },
    });
    tokens.set(m.id, t);
  }

  const record = await db.contribRecord.create({
    data: { memberId: owner.id, kind: "task", title: "이견 확인용", detail: "지워질 것", source: "self" },
  });

  const { disputeContribRecord, resolveContribDispute } = await import("@/server/actions/contrib");

  const as = async (memberId: string, call: () => Promise<unknown>) => {
    session.as(tokens.get(memberId)!);
    return call();
  };

  // 첫 의견 — 이건 어떤 경로로도 지워지지 않는다.
  const first = await as(other.id, () => disputeContribRecord(record.id, "사실과 다릅니다"));
  check("첫 의견이 붙는다", first, "ok");

  // 정리한다. 그러면 다음 의견이 다시 붙을 수 있다(액션이 막지 않는다).
  const resolved = await as(owner.id, () => resolveContribDispute(record.id, "accept"));
  check("기록 주인이 정리한다", resolved, "ok");

  const second = await as(other.id, () => disputeContribRecord(record.id, "정리는 틀렸습니다"));
  check("정리된 뒤 다시 의견을 달 수 있다", second, "ok");

  // **여기가 이 검사의 핵심.** 두 의견이 둘 다 이력에 남아야 한다.
  const history = await db.contribDispute.findMany({
    where: { recordId: record.id },
    orderBy: { createdAt: "asc" },
    select: { text: true },
  });
  check(
    "**앞선 의견이 이력에 남는다** (액션 경로)",
    history.map((h) => h.text),
    ["사실과 다릅니다", "정리는 틀렸습니다"],
  );

  const current = await db.contribRecord.findUniqueOrThrow({ where: { id: record.id } });
  check("기록 칸은 지금 떠 있는 의견만 가리킨다", current.dispute, "정리는 틀렸습니다");
  check("새 의견이 달리니 정리 내용은 비워진다", current.resolution, null);
  check("새로 달린 의견의 작성자가 남는다", current.disputedById, other.id);

  /**
   * **보이지 않는다는 사실까지 확인한다.** 이력은 쌓이는데 아무도 읽지 않는다. 그래서 리포트의
   * "정리되지 않은 의견" 은 이력 행 수가 아니라 **기록 칸**으로 센다 — 이력이 늘어나도 그 숫자는
   * 따라가지 않는다.
   *
   * 이 문장은 지금의 계약을 고정한다. 나중에 이력을 보여 주기로 결정하면 **이 숫자의 정의가
   * 바뀐다** — 그날 이 검사를 고치지 않으면 숫자가 조용히 갈 수도 있다.
   */
  const unresolvedCount = await db.contribRecord.count({
    where: { member: { teamId: team.id }, dispute: { not: null }, resolution: NO_AGREEMENT },
  });
  check("리포트가 세는 것은 기록 칸이지 이력 행 수가 아니다", unresolvedCount, 0);
  truthy("이력은 두 건 그대로다", history.length === 2);

  session.nobody();
  await db.contribDispute.deleteMany({ where: { recordId: record.id } });
  await db.contribRecord.delete({ where: { id: record.id } });
  await db.team.delete({ where: { id: team.id } });

  console.log(`\n${failed === 0 ? "모두 통과" : `${failed}건 실패`} — ${passed}건 통과, ${failed}건 실패`);
  return failed === 0;
}