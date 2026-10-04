import "./load-env.mjs";

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { refineScript, rewriteWithCushion, searchResearch, summarizeMeeting, convertSentence } from "../src/server/ai/tools.js";
import {
  CLERK_CORPUS,
  CUSHION_CORPUS,
  PRESENT_CORPUS,
  RESEARCH_CORPUS,
  SENTENCE_CORPUS,
  type ClerkCase,
  type CushionCase,
  type PresentCase,
  type ResearchCase,
  type SentenceCase,
} from "./tool-corpus.mjs";

/**
 * AI 서기 · 발표 지원 · 리서처의 **모델 비교 하네스**.
 *
 * ```bash
 * npm run tool:bench -- --tool clerk    --models openrouter/free
 * npm run tool:bench -- --tool clerk    --models openrouter/free,qwen/qwen3.8-27b:free
 * npm run tool:bench -- --tool present  --models openrouter/free --strict
 * npm run tool:bench -- --tool research --models openrouter/free
 * npm run tool:bench -- --tool clerk    --models openrouter/free --repeat 3 --compare
 * npm run tool:bench -- --check-env      # .env 의 슬러그가 카탈로그에 있는지
 * ```
 *
 * ## 반복 · 저장 · 비교
 *
 * 무료 라우터는 요청마다 다른 모델을 잡으므로 **한 번의 통과/실패는 표본이 아니다.**
 * - `--repeat N` — 케이스마다 N 번 돌려 통과율과 **최악 회차**(가장 낮은 회차 통과 수)를 낸다.
 * - 결과는 `scripts/bench-results/<날짜>-<도구>.json` 에 저장된다(`--no-save` 로 끈다).
 *   모델 출력이 아니라 **판정 요약만** 담는다.
 * - `--compare` — 같은 도구의 **직전 저장 결과**와 모델별 통과율 차이를 보여 준다.
 * - 유형(`kind`)별 통과율도 낸다 — 적대적 입력에서만 무너지는 모델을 가려낸다.
 *
 * ## 왜 이게 필요한가
 *
 * 읽기 순화만 벤치가 있다(`npm run cushion:bench`). 그래서 **서기·발표·리서처의 프롬프트와
 * 모델은 눈으로만 확인했다** — "방금 고친 게 나아졌다" 는 기억이 쌓이는 자리다. 0단계에서
 * 도구별 모델을 나누려면 **비교할 숫자**가 먼저 있어야 한다.
 *
 * ## 무엇을 재나 — 도구마다 다르다
 *
 * 세 도구가 어기는 약속이 다르므로 **한 점수로 줄이지 않는다.** 도구마다 자기 열을 가진다.
 *
 * | 도구 | 열 | 뜻 |
 * |---|---|---|
 * | 서기 | `담당자` | `null` 이어야 하는 메모에서 `null` 을 낸 비율 — **가장 위험한 실패** |
 * | 서기 | `이름` | 정해진 이름이 그대로 나온 비율 |
 * | 서기 | `지어냄` | 메모에 없는 수치를 넣은 횟수 |
 * | 발표 | `수치` | 대본의 수치가 살아남은 비율 |
 * | 발표 | `수치 지어냄` | 대본에 없는 수치를 넣은 횟수 |
 * | 발표 | `질문` | 예상 질문 개수(범위 안이면 통과) |
 * | 리서처 | `출처` | 인용된 출처 수 / **주소 하나라도 지어냈나** |
 * | 쿠션 | `요구` | 요구·마감이 살아남았나 — **이게 0 이면 부드럽게 지운 것이다** |
 * | 쿠션 | `약속` | 원문에 없던 양보·기한 완화를 만들어 넣었나 |
 * | 문장 | `살아남음` | 정해진 것·담당자·날짜가 남았나 / 새로 넣은 것 |
 * | 문장 | `길이` | 요약 모드의 축약 비율 |
 *
 * 어느 열이든 **0 이어야 하는 것**이 0 이 아니면 그 행의 다른 수치를 믿으면 안 된다.
 *
 * ## 이 스크립트는 `npm test` 에 들어가지 않는다
 *
 * 모델을 불러서 돈과 시간이 든다. **비용 없이 검사할 수 있는 불변식(담당자 `null` 을 코드에서
 * 거르는 규칙 등)은 `scripts/smoke.mts` 가 이미 하고 있다.**
 *
 * `--strict` 를 주면 계약(담당자 추측 0 · 수치 지어냄 0 · 지어낸 주소 0 · 없는 약속 0)을 어긴
 * 모델에서 종료 코드가 1이 된다.
 */

type ToolKey = "clerk" | "present" | "research" | "cushion" | "sentence";

const TOOLS: ToolKey[] = ["clerk", "present", "research", "cushion", "sentence"];

function readArgs(): { tool: ToolKey; models: string[]; strict: boolean; repeat: number; compare: boolean; save: boolean } {
  const argv = process.argv.slice(2);
  const pick = (flag: string) => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  if (argv.includes("--list")) {
    for (const key of TOOLS) console.log(`${key.padEnd(10)} 입력 ${CORPUS_LENGTH[key]}개`);
    process.exit(0);
  }
  const tool = (pick("--tool") ?? "clerk") as ToolKey;
  if (!TOOLS.includes(tool)) {
    throw new Error(`--tool 은 ${TOOLS.join(" · ")} 중 하나여야 합니다. 받은 값: ${tool}`);
  }
  const models = (pick("--models") ?? "openrouter/free").split(",").map((m) => m.trim()).filter(Boolean);
  const repeat = Math.max(1, Math.floor(Number(pick("--repeat") ?? 1)) || 1);
  return { tool, models, strict: argv.includes("--strict"), repeat, compare: argv.includes("--compare"), save: !argv.includes("--no-save") };
}

/**
 * `--list-models` — **지금 이 순간에 쓸 수 있는 무료 모델**을 보여 준다.
 *
 * 왜 이게 필요한가: `.env` 에 적힌 무료 슬러그는 **썩는다.** 실측에서 무료 카탈로그 16개가
 * 전부 다른 세대였고, 예전에 문서에 적혀 있던 유료 슬러그는 목록에 없었다. 슬러그가 사라지면
 * 404·429 가 나고, 그건 "무료 모델이 안 된다" 가 아니라 **"이 이름이 없어졌다"** 다 — 둘을
 * 구분하려면 목록을 봐야 한다.
 *
 * **함수 호출(구조화 출력)을 지원하는지도 함께 보여 준다.** 이게 서기·발표·리서처의 생존
 * 조건이다 — 실측에서 무료 모델 12개 중 **3개만** `tool_choice` 를 지켰다. 나머지는 도구
 * 목록에 `tools` 가 있다고 적혀 있어도 실제로는 본문을 털어쏜다(모델이 `tool_choice` 를 무시).
 */
async function listFreeModels() {
  const key = process.env.OPENROUTER_KEY;
  if (!key) throw new Error("OPENROUTER_KEY 가 없어 목록을 볼 수 없습니다.");
  const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  const body = (await res.json()) as {
    data: Array<{ id: string; context_length?: number; supported_parameters?: string[] }>;
  };
  const free = body.data.filter((m) => m.id.endsWith(":free"));
  const wants = (m: (typeof body.data)[number], key2: string) => m.supported_parameters?.includes(key2) ?? false;

  // 한국 날짜로 적는다 — 이 저장소의 다른 곳(하루 한도·사용 내역)이 모두 그 기준이다.
  // UTC 로 적으면 밤 9시 이후에 하루가 밀린다.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  console.log(`무료 모델 ${free.length}개 (${day} 기준)\n`);
  for (const m of free) {
    const fn = wants(m, "tool_choice");
    const schema = wants(m, "structured_outputs") || wants(m, "response_format");
    const ctx = m.context_length ? `${Math.round(m.context_length / 1000)}k` : "-";
    console.log(
      [
        `  ${m.id.padEnd(46)}`,
        ctx.padStart(6),
        fn ? "함수호출 ○" : "함수호출 ×",
        schema ? "구조화 ○" : "구조화 ×",
      ].join("  "),
    );
  }
  console.log(
    [
      "",
      "**이 표는 OpenRouter 의 '선언'이다 — 사실이 아니다.** 실측에서 이 16개 중 `tool_choice` 를",
      "실제로 지킨 것은 3개뿐이었다(나머지는 429 로 막히거나 도구 목록에 있어도 본문을 털어쏨).",
      "**그래서 기본값은 벤치가 정한다:** `npm run tool:bench -- --tool <도구> --models <슬러그>`",
    ].join("\n"),
  );
}

/**
 * `--check-env` — `.env` 에 적힌 모델 슬러그가 **지금 카탈로그에 있는지** 본다.
 *
 * 슬러그는 썩는다(사라지면 404). 그걸 사용자가 먼저 알게 되면 늦다 — 주기 실행(CI)이 먼저
 * 알도록 한다. `openrouter/free` 는 라우터라 카탈로그 항목이 아니므로 검사하지 않는다.
 * 없는 슬러그가 하나라도 있으면 종료 코드 1.
 */
async function checkEnvSlugs() {
  const key = process.env.OPENROUTER_KEY;
  if (!key) throw new Error("OPENROUTER_KEY 가 없어 슬러그를 확인할 수 없습니다.");
  const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  const body = (await res.json()) as { data: Array<{ id: string }> };
  const known = new Set(body.data.map((m) => m.id));

  const configured = Object.entries(process.env).filter(
    ([name, value]) => /^OPENROUTER_(MODEL|FALLBACK_MODEL)(_|$)/.test(name) && value?.trim(),
  );
  let missing = 0;
  for (const [name, value] of configured) {
    const slug = value!.trim();
    if (slug === "openrouter/free") continue;
    const ok = known.has(slug);
    if (!ok) missing += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(32)} ${slug}${ok ? "" : "  ← 카탈로그에 없음"}`);
  }
  if (configured.length === 0) console.log("  지정된 슬러그가 없습니다(전부 무료 라우터).");
  if (missing > 0) {
    console.error(`\n✗ 카탈로그에 없는 슬러그 ${missing}개 — .env 를 고치세요.`);
    process.exit(1);
  }
}

/** 서기 한 건의 판정. `ok` 이 false 면 아래 `why` 를 사람이 읽는다. */
type ClerkVerdict = { ok: boolean; why: string; assignee: string | null; invented: number; found: number };

function judgeClerk(item: ClerkCase, draft: { summary: string; candidates: Array<{ title: string; assignee: string | null; basis: string; due: string }> }): ClerkVerdict {
  const found = draft.candidates.length;
  // 후보가 아예 없으면 담당자 판정은 할 수 없다 — 실패로 치되 이유를 따로 남긴다.
  if (item.candidates === 0) {
    return {
      ok: found === 0,
      why: found === 0 ? "후보가 없어야 하는데 뽑았다" : "뽑을 것이 없는 회의에서 후보를 뽑았다",
      assignee: null,
      invented: 0,
      found,
    };
  }

  // **담당자 추측** — 이 도구의 가장 위험한 실패. 후보가 여러 개면 하나라도 어긋나면 실패다.
  if (item.assignee === null) {
    const named = draft.candidates.filter((c) => c.assignee !== null);
    if (named.length > 0) {
      return {
        ok: false,
        why: `담당자 미정인 메모에 이름을 채웠다: ${named.map((c) => `${c.title} → ${c.assignee}`).join(", ")}`,
        assignee: named[0].assignee,
        invented: 0,
        found,
      };
    }
  } else {
    const hit = draft.candidates.some((c) => c.assignee === item.assignee);
    if (!hit) {
      return {
        ok: false,
        why: `메모에 적힌 담당자(${item.assignee})가 후보에 없다`,
        assignee: null,
        invented: 0,
        found,
      };
    }
  }

  // **수치 생존** — 메모의 수치가 **어디에든** 남아 있어야 한다.
  //
  // 처음에는 후보 제목만 봤다가 전부 "사라졌다" 로 나왔다. 그건 **판정의 오류**였다 — 날짜는
  // 제목이 아니라 `due` 에, 비율은 `summary` 에 가는 게 맞다. 고치지 않으면 "수치를 잃는다" 는
  // 거짓 결론 위에서 모델을 고르게 된다. 그래서 **후보의 모든 글**을 본다.
  const allText = [
    draft.summary,
    ...draft.candidates.flatMap((c) => [c.title, c.assignee ?? "", c.basis, c.due]),
  ].join(" ");
  const lost = (item.keep ?? []).filter((k) => !allText.includes(k));
  if (lost.length > 0) {
    return { ok: false, why: `수치가 사라졌다: ${lost.join(", ")}`, assignee: null, invented: 0, found };
  }

  // **지어냄** — 메모에 없는 수치를 넣으면 사람이 그대로 믿는다.
  const invented = (item.invent ?? []).filter((k) => allText.includes(k));
  if (invented.length > 0) {
    return { ok: false, why: `메모에 없는 것을 넣었다: ${invented.join(", ")}`, assignee: null, invented: invented.length, found };
  }

  return { ok: true, why: "", assignee: null, invented: 0, found };
}

type PresentVerdict = { kept: number; keepTotal: number; invented: string[]; questions: number; ok: boolean; why: string };

function judgePresent(item: PresentCase, draft: { refined: string; questions: string[] }): PresentVerdict {
  const kept = item.keep.filter((k) => draft.refined.includes(k)).length;
  const invented = (item.invent ?? []).filter((k) => draft.refined.includes(k));
  const [lo, hi] = item.questions;
  const questions = draft.questions.length;
  const problems: string[] = [];
  if (kept < item.keep.length) problems.push(`수치 ${item.keep.length - kept}개가 사라졌다`);
  if (invented.length > 0) problems.push(`없는 수치를 넣었다: ${invented.join(", ")}`);
  if (questions < lo || questions > hi) problems.push(`질문 ${questions}개(범위 ${lo}~${hi})`);
  return { kept, keepTotal: item.keep.length, invented, questions, ok: problems.length === 0, why: problems.join(" · ") };
}

type ResearchVerdict = { sources: number; fake: number; years: number; citations: number; ok: boolean; why: string };

function judgeResearch(
  item: ResearchCase,
  results: Array<{ url: string | null; year?: string | null; citation?: string | null }>,
): ResearchVerdict {
  const withUrl = results.filter((r) => r.url);
  const sources = withUrl.length;
  // 주소가 하나라도 없다면 "출처 없는 결과를 보여주지 않는다" 는 약속을 깬 것이다.
  // 코드가 이미 걸러 냈어야 하므로, 여기 남아 있으면 **코드 쪽 계약이 깨진 것**이다.
  const fake = results.length - sources;
  const years = results.filter((r) => Boolean(r.year)).length;
  const citations = results.filter((r) => Boolean(r.citation)).length;
  const problems: string[] = [];
  if (fake > 0) problems.push(`주소가 없는 카드가 ${fake}개 남았다`);
  if (sources < item.minSources) problems.push(`출처 ${sources}개(최소 ${item.minSources})`);
  return { sources, fake, years, citations, ok: problems.length === 0, why: problems.join(" · ") };
}

/**
 * 쿠션 번역기의 판정.
 *
 * **요구·마감이 살아남았나** 가 첫 기준이다. 쿠션은 "말투만 바꾸는 도구" 라는 약속을 하고 있고,
 * 약속을 어기면서 말만 부드러워지면 **사람이 "이건 부탁이 아니네" 하고 넘긴다.** 즉 실패가
 * 조용하다 — 아무도 모르게 일이 밀린다. 그래서 `keep` 을 먼저 본다.
 */
type CushionVerdict = { kept: number; keepTotal: number; invented: string[]; ok: boolean; why: string };

function judgeCushion(item: CushionCase, out: string): CushionVerdict {
  const kept = item.keep.filter((k) => out.includes(k)).length;
  const invented = item.invent.filter((k) => out.includes(k));
  const problems: string[] = [];
  if (kept < item.keep.length) {
    const lost = item.keep.filter((k) => !out.includes(k));
    problems.push(`요구·마감이 사라졌다: ${lost.join(", ")}`);
  }
  if (invented.length > 0) problems.push(`없는 약속을 만들었다: ${invented.join(", ")}`);
  return { kept, keepTotal: item.keep.length, invented, ok: problems.length === 0, why: problems.join(" · ") };
}

type SentenceVerdict = { kept: number; keepTotal: number; invented: string[]; ratio: number; ok: boolean; why: string };

function judgeSentence(item: SentenceCase, out: string): SentenceVerdict {
  const kept = item.keep.filter((k) => out.includes(k)).length;
  const invented = item.invent.filter((k) => out.includes(k));
  const ratio = item.text.length === 0 ? 1 : out.length / item.text.length;
  const problems: string[] = [];
  if (kept < item.keep.length) {
    problems.push(`남아야 할 것이 사라졌다: ${item.keep.filter((k) => !out.includes(k)).join(", ")}`);
  }
  if (invented.length > 0) problems.push(`없는 것을 넣었다: ${invented.join(", ")}`);
  if (item.maxRatio !== undefined && ratio > item.maxRatio) {
    problems.push(`요약이 아님 (원문 ${(ratio * 100).toFixed(0)}%, 상한 ${(item.maxRatio * 100).toFixed(0)}%)`);
  }
  return { kept, keepTotal: item.keep.length, invented, ratio, ok: problems.length === 0, why: problems.join(" · ") };
}

/** `--tool` 별 코퍼스 길이. 위 `TOOL_CORPORA` 와 같은 값인데 타입이 동시에 두 군데 늘어난다. */
const CORPUS_LENGTH: Record<ToolKey, number> = {
  clerk: CLERK_CORPUS.length,
  present: PRESENT_CORPUS.length,
  research: RESEARCH_CORPUS.length,
  cushion: CUSHION_CORPUS.length,
  sentence: SENTENCE_CORPUS.length,
};

/** `--tool` 별 그 도구의 코퍼스 한 건. */
function caseAt(tool: ToolKey, index: number) {
  if (tool === "clerk") return CLERK_CORPUS[index];
  if (tool === "present") return PRESENT_CORPUS[index];
  if (tool === "research") return RESEARCH_CORPUS[index];
  if (tool === "cushion") return CUSHION_CORPUS[index];
  return SENTENCE_CORPUS[index];
}

type Row = { id: string; kind: string; ok: boolean; why: string; seconds: number; cells: Record<string, string | number> };

async function runOne(tool: ToolKey, model: string, index: number): Promise<Row> {
  const started = Date.now();
  try {
    if (tool === "clerk") {
      const item = CLERK_CORPUS[index];
      const draft = await summarizeMeeting(item.memo, model);
      const v = judgeClerk(item, draft);
      return {
        id: item.id,
        kind: item.kind ?? "normal",
        ok: v.ok,
        why: v.why,
        seconds: (Date.now() - started) / 1000,
        cells: { 담당자: v.assignee ?? "null", 후보: v.found, 지어냄: v.invented },
      };
    }
    if (tool === "present") {
      const item = PRESENT_CORPUS[index];
      const draft = await refineScript(item.script, model);
      const v = judgePresent(item, draft);
      return {
        id: item.id,
        kind: item.kind ?? "normal",
        ok: v.ok,
        why: v.why,
        seconds: (Date.now() - started) / 1000,
        cells: { 수치: `${v.kept}/${v.keepTotal}`, 지어냄: v.invented.length, 질문: v.questions },
      };
    }
    if (tool === "research") {
      const item = RESEARCH_CORPUS[index];
      const results = await searchResearch(item.query, model);
      const v = judgeResearch(item, results);
      return {
        id: item.id,
        kind: item.kind ?? "normal",
        ok: v.ok,
        why: v.why,
        seconds: (Date.now() - started) / 1000,
        cells: { 출처: v.sources, 지어냄: v.fake, 연도: v.years, 인용: v.citations },
      };
    }
    if (tool === "cushion") {
      const item = CUSHION_CORPUS[index];
      const out = await rewriteWithCushion(item.text, item.tone, model);
      const v = judgeCushion(item, out);
      return {
        id: item.id,
        kind: item.kind ?? "normal",
        ok: v.ok,
        why: v.why,
        seconds: (Date.now() - started) / 1000,
        cells: { 요구: `${v.kept}/${v.keepTotal}`, 약속: v.invented.length },
      };
    }
    const item = SENTENCE_CORPUS[index];
    const out = await convertSentence(item.text, item.mode, model);
    const v = judgeSentence(item, out);
    return {
      id: item.id,
      kind: item.kind ?? "normal",
      ok: v.ok,
      why: v.why,
      seconds: (Date.now() - started) / 1000,
      cells: { 살아남음: `${v.kept}/${v.keepTotal}`, 지어냄: v.invented.length, 길이: `${(v.ratio * 100).toFixed(0)}%` },
    };
  } catch (error) {
    // 한 건이 통째로 실패하면 그건 실패다 — **숨기지 않는다.** 슬쩍 넘기면 "모델이 안 된다" 와
    // "내 코드가 못 돌렸다" 가 같은 0 으로 보인다.
    return {
      id: caseAt(tool, index).id,
      kind: caseAt(tool, index).kind ?? "normal",
      ok: false,
      why: `호출 실패: ${(error as Error).message}`,
      seconds: (Date.now() - started) / 1000,
      cells: {},
    };
  }
}

const { tool, models, strict, repeat, compare, save } = readArgs();

if (process.argv.includes("--list-models")) {
  await listFreeModels();
  process.exit(0);
}

if (process.argv.includes("--check-env")) {
  await checkEnvSlugs();
  process.exit(0);
}

const total = CORPUS_LENGTH[tool];

/** 저장되는 한 모델의 요약. 모델 출력은 담지 않는다. */
type ModelSummary = {
  model: string;
  /** 회차별 통과 수. */
  passesPerRun: number[];
  total: number;
  /** 전체 통과율(0~1). */
  rate: number;
  /** 가장 나빴던 회차의 통과율(0~1). */
  worst: number;
  avgSeconds: number;
  byKind: Record<string, { passed: number; total: number }>;
  /** 한 번이라도 실패한 케이스 id → 실패 횟수. */
  failures: Record<string, number>;
};

type SavedRun = { tool: ToolKey; at: string; repeat: number; corpus: number; models: ModelSummary[] };

const RESULTS_DIR = path.join(import.meta.dirname, "bench-results");

/** 같은 도구의 가장 최근 저장 결과. 이번 실행을 저장하기 **전에** 읽어야 직전 것이 된다. */
function previousRun(): SavedRun | null {
  try {
    const files = readdirSync(RESULTS_DIR)
      .filter((f) => f.endsWith(`-${tool}.json`))
      .sort();
    const last = files.at(-1);
    return last ? (JSON.parse(readFileSync(path.join(RESULTS_DIR, last), "utf8")) as SavedRun) : null;
  } catch {
    return null;
  }
}

const previous = compare ? previousRun() : null;

console.log(`도구 벤치 · ${tool} · 입력 ${total}개 × ${repeat}회\n`);

const summaries: ModelSummary[] = [];
for (const model of models) {
  console.log(`— ${model} 부르는 중…`);
  const passesPerRun: number[] = [];
  const byKind: ModelSummary["byKind"] = {};
  const failures: Record<string, number> = {};
  let seconds = 0;
  let calls = 0;

  for (let run = 0; run < repeat; run += 1) {
    if (repeat > 1) console.log(`  회차 ${run + 1}/${repeat}`);
    const rows: Row[] = [];
    // 순서대로 부른다. 무료 라우터는 초당 요청 수에 제한이 걸려서 **동시에 부르면 429 로
    // 떨어지고 그 429 가 "이 모델의 품질" 이 되어 버린다** — 나란히 비교하려면 같은 조건이어야 한다.
    for (let i = 0; i < total; i += 1) rows.push(await runOne(tool, model, i));

    for (const row of rows) {
      const mark = row.ok ? "✓" : "✗";
      const cells = Object.entries(row.cells).map(([k, v]) => `${k} ${v}`).join(" · ");
      console.log(`    ${mark} ${row.id} (${row.seconds.toFixed(1)}초) ${cells}${row.why ? `\n        ${row.why}` : ""}`);
      const bucket = (byKind[row.kind] ??= { passed: 0, total: 0 });
      bucket.total += 1;
      if (row.ok) bucket.passed += 1;
      else failures[row.id] = (failures[row.id] ?? 0) + 1;
      seconds += row.seconds;
      calls += 1;
    }
    passesPerRun.push(rows.filter((r) => r.ok).length);
  }

  const passedAll = passesPerRun.reduce((a, b) => a + b, 0);
  summaries.push({
    model,
    passesPerRun,
    total,
    rate: passedAll / (total * repeat),
    worst: Math.min(...passesPerRun) / total,
    avgSeconds: seconds / (calls || 1),
    byKind,
    failures,
  });
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

console.log(`\n${"모델".padEnd(30)}${"통과율".padStart(8)}${"최악".padStart(8)}${"평균초".padStart(9)}`);
for (const row of summaries) {
  console.log([row.model.slice(0, 29).padEnd(30), pct(row.rate).padStart(8), pct(row.worst).padStart(8), row.avgSeconds.toFixed(1).padStart(9)].join(""));
}

console.log("\n유형별 통과율");
for (const row of summaries) {
  const parts = Object.entries(row.byKind).map(([k, v]) => `${k} ${v.passed}/${v.total}`);
  console.log(`  ${row.model.slice(0, 29).padEnd(30)}${parts.join(" · ")}`);
}

if (compare) {
  console.log("\n직전 결과와 비교");
  if (!previous) {
    console.log("  저장된 직전 결과가 없습니다(이번이 첫 기록).");
  } else {
    console.log(`  직전: ${previous.at} (코퍼스 ${previous.corpus}개 × ${previous.repeat}회)`);
    for (const row of summaries) {
      const before = previous.models.find((m) => m.model === row.model);
      if (!before) {
        console.log(`  ${row.model.slice(0, 29).padEnd(30)}직전 기록 없음`);
        continue;
      }
      const delta = (row.rate - before.rate) * 100;
      const sign = delta > 0 ? "+" : "";
      // 코퍼스가 달라졌으면 숫자를 그대로 비교하면 안 된다 — 같은 시험이 아니다.
      const note = previous.corpus !== total ? " (코퍼스 크기가 달라 참고용)" : "";
      console.log(`  ${row.model.slice(0, 29).padEnd(30)}${pct(before.rate)} → ${pct(row.rate)} (${sign}${delta.toFixed(0)}%p)${note}`);
    }
  }
}

console.log(`\n**0 이어야 하는 열(담당자 추측 · 수치 지어냄 · 지어낸 주소)이 0 이 아닌 모델은 다른 수치를 믿으면 안 된다.**`);

if (save) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const at = new Date().toISOString();
  const file = path.join(RESULTS_DIR, `${at.replace(/[:.]/g, "-")}-${tool}.json`);
  const record: SavedRun = { tool, at, repeat, corpus: total, models: summaries };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`저장: ${path.relative(process.cwd(), file)}`);
}

if (strict) {
  // 한 회차라도 실패가 있으면 계약을 어긴 것이다 — 평균이 아니라 **최악 회차**로 판정한다.
  const broken = summaries.filter((row) => row.worst < 1);
  if (broken.length > 0) {
    console.error(`\n✗ ${broken.length}개 모델이 계약을 어겼다.`);
    process.exit(1);
  }
}
