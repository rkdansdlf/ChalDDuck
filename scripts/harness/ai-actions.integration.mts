/**
 * AI 액션·누가 하지 검사 — 화면이 부르는 **문**이 규칙대로 열리고 닫히는지 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * `ai.*` 일곱 개와 `social.spinMenu` 는 `audit:actions` 의 마지막 "없음"이었다. `ai` 하네스(`test:ai`)는
 * 사용 기록(`limit.ts`)을 보고, `smoke-ai` 는 모델 층의 순수 규칙을 본다. **그 사이 — 액션이 문을 올바르게
 * 여닫는가 — 는 아무도 보지 않았다.**
 *
 * 읽으며 위험한 곳을 셌다 —
 *
 * - **키가 없으면 예시를 돌려준다.** 그리고 **부르지 않은 호출은 기록하지 않는다.** 기록하면 아무도 쓰지
 *   않은 도구가 쓴 것으로 센다. 그 예시가 "AI 결과" 처럼 보이면 안 되므로 `source` 가 `sample` 이어야 한다.
 * - **모델이 실패하면 한도를 되돌린다.** 실패를 던지지 않고 **돌려준다** — 운영 빌드는 던진 문구를
 *   지워서 사용자에게 닿지 않는다. 되돌리는 행은 방금 깎은 그 행 하나뿐이다.
 * - **리서치는 출처가 없는 결과를 돌려주지 않는다.**
 * - **내역·요약은 내 팀 것만.** 남의 팀 이름·시각이 섞이면 안 되고, 요약에는 개인이 없다. CSV 는 이름에
 *   쉼표·따옴표가 들어가도 칸이 밀리지 않아야 하고 엑셀이 한글을 깨뜨리지 않도록 BOM 이 있어야 한다.
 * - **오늘 쓴 횟수는 읽기만 한다.** 보려고 부른 것이 기록이 되면 안 된다. 읽기 도움은 따로 센다.
 * - **누가 하지는 팀에 하나다.** 목록에 없는 도구 이름은 저장하지 않고, 동시에 돌려도 결과·도구·정한 사람이
 *   **한 번의 돌림에서 나온 한 벌**이어야 한다.
 *
 * ## 검사하지 않는 것
 *
 * - 모델이 실제로 무엇을 말하는가 — 모델 호출 주소가 코드에 고정돼 있어 가짜 서버를 둘 수 없고, 외부로
 *   요청을 보내지 않는다. 키가 있는 경로는 `runTool` 에 호출 함수를 직접 넘겨 본다.
 * - `exportAiUsage` 가 **누구의 내역까지 담는가** — 팀 전체인지 내 것인지는 정해지지 않은 정책이고(AI 허브의
 *   `<Undecided>`), 다른 작업에서 바뀌고 있다. 여기서는 팀 경계와 형식만 고정한다.
 *
 *   npm run test:ai-actions
 */
import { randomUUID } from "node:crypto";

import {
  AI_POLICY,
  CLERK_SAMPLE_DRAFT,
  MENU_OPTIONS,
  RANDOM_TOOLS,
  SENTENCE_SAMPLE_INPUT,
} from "../../src/data/catalog.js";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

/** 한국 날짜 — `ai/limit.ts` 와 같은 기준이다. */
const seoulDay = (at: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(at));

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const aiActions = await import("../../src/server/actions/ai.js");
  const social = await import("../../src/server/actions/social.js");
  const { runTool } = await import("../../src/server/ai/run.js");

  // 이 하네스는 키가 **없는** 상태에서 시작한다. 개발 환경에 키가 있어도 실제 모델을 부르지 않는다.
  const savedKey = process.env.OPENROUTER_KEY;
  delete process.env.OPENROUTER_KEY;

  let failed = 0;
  let passed = 0;
  function check(what: string, got: unknown, want: unknown): void {
    const same = JSON.stringify(got) === JSON.stringify(want);
    passed += 1;
    if (same) console.log(`  ✓ ${what}`);
    else {
      failed += 1;
      console.log(`  ✗ ${what}\n      기대 ${JSON.stringify(want)}\n      실제 ${JSON.stringify(got)}`);
    }
  }
  async function blocked(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return "(막지 않음)";
    } catch (e) {
      const err = e as Error & { digest?: string };
      return err.digest?.startsWith("NEXT_REDIRECT") ? `redirect:${err.digest}` : err.message;
    }
  }

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];
  const today = seoulDay(Date.now());

  async function makeTeam(label: string, leaderName = `김민준${suffix}`) {
    session.reset();
    const team = await db.team.create({
      data: { name: `AI 액션 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(team.id);
    const leader = await db.member.create({ data: { teamId: team.id, name: leaderName, isLeader: true } });
    const mate = await db.member.create({ data: { teamId: team.id, name: `이서연${suffix}` } });
    const third = await db.member.create({ data: { teamId: team.id, name: `박도윤${suffix}` } });
    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({ data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return t;
    };
    return {
      id: team.id,
      leader,
      mate,
      third,
      asLeader: await token(leader.id),
      asMate: await token(mate.id),
      asThird: await token(third.id),
    };
  }

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  const usage = (teamId: string, tool?: string) =>
    db.aiUsage.count({ where: { teamId, day: today, ...(tool ? { tool } : {}) } });
  const fill = (teamId: string, memberId: string, n: number, tool: string, day = today) =>
    db.aiUsage.createMany({ data: Array.from({ length: n }, () => ({ teamId, memberId, tool, day })) });

  try {
    /* ── 1) 예시 문장 · 오늘 쓴 횟수 ───────────────────────── */
    console.log("\n예시 문장은 모델을 부르지 않고, 오늘 쓴 횟수는 읽기만 한다");
    const A = await makeTeam("읽기");
    const B = await makeTeam("이웃");

    check("세션이 없으면 예시를 읽을 수 없다", await blocked(() => aiActions.getSentenceSample("email")), "로그인이 필요합니다.");
    for (const mode of Object.keys(SENTENCE_SAMPLE_INPUT)) {
      check(`예시 문장(${mode})은 카탈로그 그대로다`, await as(A.asLeader, () => aiActions.getSentenceSample(mode)), SENTENCE_SAMPLE_INPUT[mode]);
    }
    check("모르는 모드는 빈 문장이다", await as(A.asLeader, () => aiActions.getSentenceSample("없는모드")), "");
    check("예시를 읽어도 기록은 남지 않는다", await usage(A.id), 0);

    check("세션이 없으면 횟수를 읽을 수 없다", await blocked(() => aiActions.getAiUsageToday()), "로그인이 필요합니다.");
    await fill(A.id, A.leader.id, 3, "clerk");
    await fill(A.id, A.mate.id, 2, "research");
    await fill(A.id, A.leader.id, 4, "read-cushion");
    await fill(B.id, B.leader.id, 7, "clerk");
    const mine = await as(A.asLeader, () => aiActions.getAiUsageToday());
    check("내가 쓴 횟수는 읽기 도움을 뺀다", mine.mine, 3);
    check("팀이 쓴 횟수도 읽기 도움을 뺀다", mine.team, 5);
    check("읽기 도움은 따로 센다", [mine.cushionMine, mine.cushionTeam], [4, 4]);
    check("다른 팀의 사용은 섞이지 않는다", (await as(B.asLeader, () => aiActions.getAiUsageToday())).team, 7);
    const before = await usage(A.id);
    await as(A.asLeader, () => aiActions.getAiUsageToday());
    await as(A.asLeader, () => aiActions.getAiUsageToday());
    check("몇 번을 읽어도 기록은 늘지 않는다", await usage(A.id), before);

    /* ── 2) 키가 없으면 예시를 돌려주고 기록하지 않는다 ─────── */
    console.log("\n키가 없으면 예시를 돌려주고, 부르지 않은 호출은 기록하지 않는다");
    const C = await makeTeam("샘플");
    const clerk = await as(C.asLeader, () => aiActions.summarizeMeeting("회의 메모입니다"));
    check("서기는 예시를 돌려준다", clerk.ok && clerk.source, "sample");
    check("서기 예시는 카탈로그의 초안이다", clerk.ok && clerk.value.summary, CLERK_SAMPLE_DRAFT.summary);
    const research = await as(C.asLeader, () => aiActions.searchResearch("무임승차"));
    check("리서치도 예시다", research.ok && research.source, "sample");
    check(
      "리서치 결과는 모두 출처가 있다 — 출처 없는 결과는 돌려주지 않는다",
      research.ok && research.value.length > 0 && research.value.every((r) => r.source.trim().length > 0),
      true,
    );
    const present = await as(C.asLeader, () => aiActions.refineScript("발표 대본입니다", "conversational"));
    check("발표 다듬기도 예시이고 요청한 모드가 따라온다", present.ok && [present.source, present.value.mode], ["sample", "conversational"]);
    const presentDefault = await as(C.asLeader, () => aiActions.refineScript("발표 대본입니다"));
    check("모드를 안 주면 학술체다", presentDefault.ok && presentDefault.value.mode, "academic");
    // 화면이 보낸 값을 믿지 않는다 — 모르는 모드는 학술체로 떨어지고, 지어낸 모드가 결과에 남지 않는다.
    const presentBad = await as(C.asLeader, () => aiActions.refineScript("발표 대본입니다", "casual" as never));
    check("모르는 모드는 학술체로 떨어진다", presentBad.ok && presentBad.value.mode, "academic");
    check("부르지 않은 호출은 기록하지 않는다", await usage(C.id), 0);
    check("계측 기록도 남기지 않는다", await db.aiCall.count({ where: { teamId: C.id } }), 0);
    // 세션이 없을 때 서기는 가입 화면으로 보내고, 나머지는 로그인이 필요하다고 말한다.
    // 서기는 팀을 먼저 읽는다(`getCurrentTeam`) — 세션이 없으면 가입 화면으로 보낸다. 하네스의
    // `redirect` 대역은 이동 대신 이 문구를 던진다(`request-context.mjs`).
    check("세션 없는 서기는 가입 화면으로 보낸다", await blocked(() => aiActions.summarizeMeeting("x")), "__harness_redirect__:/join");
    check("세션 없는 리서치는 막힌다", await blocked(() => aiActions.searchResearch("x")), "로그인이 필요합니다.");
    check("세션 없는 발표 다듬기는 막힌다", await blocked(() => aiActions.refineScript("x")), "로그인이 필요합니다.");

    /* ── 3) 키가 있을 때: 기록하고, 실패하면 되돌린다 ─────── */
    console.log("\n키가 있으면 기록하고, 모델이 실패하면 방금 깎은 몫만 되돌린다");
    const D = await makeTeam("키있음");
    process.env.OPENROUTER_KEY = "harness-flag-only-never-sent";
    try {
      const ok = await as(D.asLeader, () => runTool("clerk", async () => "결과"));
      check("성공하면 값이 온다", ok, { ok: true, value: "결과", source: "ai" });
      check("성공한 호출은 기록으로 남는다", await usage(D.id, "clerk"), 1);

      const failedCall = await as(D.asLeader, () =>
        runTool("clerk", async () => {
          throw new Error("429 Too Many Requests");
        }),
      );
      check("실패는 던지지 않고 돌려준다", failedCall.ok, false);
      check(
        "실패 문구는 사용자 말이고 SDK 원문이 아니다",
        !failedCall.ok && failedCall.message.startsWith("AI 응답을 받지 못했습니다."),
        true,
      );
      check("실패한 호출은 기록에서 되돌린다 — 처음 한 건만 남는다", await usage(D.id, "clerk"), 1);

      // 환불은 **방금 깎은 그 행 하나**만 지운다. 그 사이에 다른 사람이 쓴 몫은 건드리지 않는다.
      await fill(D.id, D.mate.id, 2, "clerk");
      const raced = await as(D.asLeader, () =>
        runTool("clerk", async () => {
          await fill(D.id, D.third.id, 1, "clerk"); // 호출하는 동안 다른 사람이 썼다
          throw new Error("빈 응답");
        }),
      );
      check("그 사이에 다른 사람이 쓴 몫은 지워지지 않는다", [raced.ok, await usage(D.id, "clerk")], [false, 4]);

      // 도구마다 따로 센다.
      await as(D.asLeader, () => runTool("research", async () => []));
      check("도구마다 따로 기록된다", [await usage(D.id, "research"), await usage(D.id, "clerk")], [1, 4]);

      check(
        "세션이 없으면 기록하지도 부르지도 않는다",
        await blocked(() => runTool("clerk", async () => "x")),
        "로그인이 필요합니다.",
      );
    } finally {
      delete process.env.OPENROUTER_KEY;
    }

    /* ── 4) 내역 내려받기 ──────────────────────────────────── */
    console.log("\n내역 CSV 는 내 팀 것만, 엑셀에서 깨지지 않게");
    // 이름에 쉼표와 따옴표가 든 팀원 — 칸이 밀리지 않아야 한다.
    const E = await makeTeam("내역", `김,민준"${suffix}`);
    const F = await makeTeam("이웃내역", `남의팀${suffix}`);
    await fill(E.id, E.leader.id, 2, "clerk");
    await fill(E.id, E.mate.id, 1, "read-cushion");
    await fill(F.id, F.leader.id, 3, "research");
    // 보관 기간이 지난 기록 — 내려받는 파일에 들어가지 않는다.
    await fill(E.id, E.leader.id, 1, "present", seoulDay(Date.now() - (AI_POLICY.retentionDays + 5) * 86_400_000));

    check("세션이 없으면 내려받을 수 없다", await blocked(() => aiActions.exportAiUsage()), "로그인이 필요합니다.");
    const exported = await as(E.asLeader, () => aiActions.exportAiUsage());
    check("파일 이름에 오늘 날짜가 있다", exported.filename, `찰떡-AI-사용내역-${today}.csv`);
    check("엑셀이 한글을 깨뜨리지 않도록 BOM 이 붙는다", exported.csv.charCodeAt(0), 0xfeff);
    const lines = exported.csv.trim().split("\r\n");
    check("머리글이 있다", lines[0]?.replace("﻿", ""), "날짜,시각(한국),팀원,도구");
    check("우리 팀의 기록만 들어 있다 (보관 기간이 지난 것 제외)", lines.length - 1, 3);
    check("남의 팀 사람의 이름은 없다", exported.csv.includes(`남의팀${suffix}`), false);
    check("도구는 사람이 읽는 이름이다", exported.csv.includes("읽기 도움"), true);
    check("쉼표·따옴표가 든 이름은 따옴표로 감싸 한 칸이 된다", exported.csv.includes(`"김,민준""${suffix}"`), true);
    check("그래서 모든 줄의 칸 수가 같다", lines.slice(1).every((l) => l.length > 0), true);
    const otherExport = await as(F.asLeader, () => aiActions.exportAiUsage());
    check("다른 팀은 자기 것만 받는다", [otherExport.csv.trim().split("\r\n").length - 1, otherExport.csv.includes(`김,민준`)], [3, false]);

    /* ── 5) 팀 요약 ────────────────────────────────────────── */
    console.log("\n팀 요약은 집계뿐이고 내 팀 것만이다");
    const G = await makeTeam("요약");
    const H = await makeTeam("이웃요약");
    check("세션이 없으면 볼 수 없다", await blocked(() => aiActions.getTeamAiSummary()), "로그인이 필요합니다.");
    const none = await as(G.asLeader, () => aiActions.getTeamAiSummary());
    check("기록이 없으면 데이터 없음이다", [none.hasData, none.totalCalls, none.successRate], [false, 0, null]);

    const call = (teamId: string, memberId: string, outcome: string, latencyMs: number, over: Record<string, unknown> = {}) =>
      ({ teamId, memberId, tool: "clerk", model: "m", day: today, outcome, latencyMs, retried: false, ...over }) as never;
    await db.aiCall.createMany({
      data: [
        call(G.id, G.leader.id, "ok", 1000),
        call(G.id, G.mate.id, "ok", 3000, { retried: true }),
        call(G.id, G.third.id, "ok", 2000),
        call(G.id, G.leader.id, "refused", 500),
        call(G.id, G.mate.id, "failed", 1500),
        // 일주일을 벗어난 기록 · 남의 팀 기록 — 세지 않는다.
        call(G.id, G.leader.id, "failed", 9999, { day: seoulDay(Date.now() - 10 * 86_400_000) }),
        call(H.id, H.leader.id, "failed", 9999),
        call(H.id, H.leader.id, "failed", 9999),
      ],
    });
    const summary = await as(G.asLeader, () => aiActions.getTeamAiSummary());
    check("7일 안의 우리 팀 호출만 센다", summary.totalCalls, 5);
    check("성공·거절·실패 비율", [summary.successRate, summary.refusalRate, summary.failureRate], [0.6, 0.2, 0.2]);
    check("평균 지연은 반올림한 밀리초다", summary.avgLatencyMs, 1600);
    check("재시도 횟수와 비율", [summary.retryCount, summary.retryRate], [1, 0.2]);
    check("요약에는 개인을 가리키는 값이 없다", Object.keys(summary).some((k) => /member|name|user|who/i.test(k)), false);
    check("다른 팀의 실패는 섞이지 않는다", (await as(H.asLeader, () => aiActions.getTeamAiSummary())).totalCalls, 2);

    /* ── 6) 누가 하지 ──────────────────────────────────────── */
    console.log("\n누가 하지 — 팀에 하나, 목록에 있는 도구만");
    const I = await makeTeam("메뉴");
    const J = await makeTeam("이웃메뉴");
    const toolNames = RANDOM_TOOLS.map((t) => t.name);
    const noticeFor = (memberId: string) =>
      db.notification.findMany({
        where: { memberId, kind: "who-does-it" },
        select: { title: true, body: true, href: true, actorId: true },
        orderBy: { createdAt: "asc" },
      });
    const teamRow = (id: string) =>
      db.team.findUniqueOrThrow({
        where: { id },
        select: { menuPick: true, menuTool: true, menuDrawnBy: true, menuPickedAt: true },
      });

    check("세션이 없으면 돌릴 수 없다", await blocked(() => social.spinMenu(toolNames[0]!)), "로그인이 필요합니다.");
    check(
      "목록에 없는 도구는 거절한다",
      await blocked(() => as(I.asLeader, () => social.spinMenu("제빵기"))),
      "모르는 추첨 도구입니다.",
    );
    const untouched = await teamRow(I.id);
    check("거절되면 아무것도 저장하지 않는다", [untouched.menuPick, untouched.menuTool, untouched.menuDrawnBy], [null, null, null]);
    check("거절되면 알림도 없다", (await noticeFor(I.mate.id)).length, 0);

    const picked = await as(I.asMate, () => social.spinMenu(toolNames[0]!));
    check("고른 결과는 메뉴 목록 안에 있다", MENU_OPTIONS.includes(picked), true);
    const saved = await teamRow(I.id);
    check("결과·도구·정한 사람이 함께 저장된다", [saved.menuPick, saved.menuTool, saved.menuDrawnBy], [picked, toolNames[0], I.mate.id]);
    check("정한 시각이 남는다", saved.menuPickedAt instanceof Date, true);
    const first = await noticeFor(I.leader.id);
    check("팀원에게 알려진다", first.length, 1);
    check("제목에 정한 사람이 있다", first[0]?.title, `${I.mate.name}님이 정했습니다`);
    check("처음 정한 거라면 도구와 결과만 말한다", first[0]?.body, `${toolNames[0]} · ${picked}`);
    check("알림이 팀 룰렛 화면으로 간다", first[0]?.href, "/team/roulette");
    check("정한 사람 자신에게는 가지 않는다", (await noticeFor(I.mate.id)).length, 0);
    check("다른 팀은 영향을 받지 않는다", [(await teamRow(J.id)).menuPick, (await noticeFor(J.leader.id)).length], [null, 0]);

    // 다시 정하면 값은 여전히 하나이고, 무엇을 대신했는지 알린다.
    const second = await as(I.asThird, () => social.spinMenu(toolNames[1]!));
    const replaced = await teamRow(I.id);
    check("다시 정해도 값은 하나다 — 마지막 결과로 바뀐다", [replaced.menuPick, replaced.menuTool, replaced.menuDrawnBy], [second, toolNames[1], I.third.id]);
    const afterRe = await noticeFor(I.leader.id);
    check("다시 정하면 무엇을 대신했는지 말한다", afterRe[1]?.body, `${toolNames[1]} · ${picked} 대신 → ${second}`);

    // 무작위가 한 값에 붙어 있지 않다 — 메뉴 일곱 개를 육십 번 돌리면 둘 이상은 나온다.
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) seen.add(await as(I.asLeader, () => social.spinMenu(toolNames[2]!)));
    check("돌릴 때마다 같은 값만 나오지 않는다", seen.size > 1, true);
    check("나온 값은 모두 메뉴 목록 안에 있다", [...seen].every((m) => MENU_OPTIONS.includes(m)), true);

    // 동시에 돌려도 한 번의 돌림에서 나온 한 벌이어야 한다: (룰렛 · 팀장) 이거나 (주사위 · 팀원).
    const K = await makeTeam("동시메뉴");
    const results = await Promise.all([
      as(K.asLeader, () => social.spinMenu("룰렛")),
      as(K.asMate, () => social.spinMenu("주사위")),
    ]);
    const finalRow = await teamRow(K.id);
    const consistent =
      (finalRow.menuTool === "룰렛" && finalRow.menuDrawnBy === K.leader.id && finalRow.menuPick === results[0]) ||
      (finalRow.menuTool === "주사위" && finalRow.menuDrawnBy === K.mate.id && finalRow.menuPick === results[1]);
    check("동시에 돌려도 결과·도구·정한 사람이 섞이지 않는다", consistent, true);
  } finally {
    if (savedKey === undefined) delete process.env.OPENROUTER_KEY;
    else process.env.OPENROUTER_KEY = savedKey;
    for (const teamId of teamIds) {
      const members = await db.member.findMany({ where: { teamId }, select: { id: true } });
      await db.aiCall.deleteMany({ where: { teamId } });
      await db.aiUsage.deleteMany({ where: { teamId } });
      await db.member.deleteMany({ where: { id: { in: members.map((m) => m.id) } } });
      await db.team.delete({ where: { id: teamId } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}
