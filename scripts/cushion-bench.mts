import "./load-env.mjs";

import { providerById } from "../src/server/ai/cushion-provider.js";
import { softenIncoming } from "../src/server/ai/tools.js";
import { judgeAll, parsePurifyResponse } from "../src/lib/read-cushion.js";
import type { CushionLevelKey } from "../src/lib/types.js";
import { CUSHION_CORPUS, type CorpusCase } from "./cushion-corpus.mjs";

/**
 * 읽기 순화 **모델 비교 하네스**.
 *
 * ```bash
 * npm run cushion:bench -- --models openrouter/free,anthropic/claude-sonnet-5
 * npm run cushion:bench -- --models openrouter/free --level STRONG --strict
 * ```
 *
 * ## 왜 이게 필요한가
 *
 * 실측: `openrouter/free` 는 협조적 말 3/3, 심한 욕설 **0/3**(안전 필터 명시적 거절), 그리고
 * 거절하지 않는 무료 모델을 직접 골라도 **욕을 그대로 남겼다**(3/3). 그때 "유료 모델로 바꾸면
 * 되나" 를 **느낌으로** 답하면 안 된다. **같은 코퍼스를 나란히 돌려 숫자로** 본다.
 *
 * ## 무엇을 재나
 *
 * | 지표 | 뜻 |
 * |---|---|
 * | `거절` | 모델이 거절했거나 빈 응답 — **AI 가 일을 하지 못한** 것 |
 * | `유효` | 검사를 통과해 실제 순화문이 된 것 |
 * | `욕설 잔존` | 유효하다고 했는데 `drop` 에 있는 낱말이 그대로 남은 것(가장 위험) |
 * | `의미 손실` | `keep` 에 있는 요구·마감·시각이 사라진 것 |
 * | `지연` | 말 하나당 평균 초 — 느리면 화면에서 기다린다 |
 *
 * `욕설 잔존` 이 0 이 아니면 **유효 수치는 믿으면 안 된다.** 검사가 뚫렸다는 뜻이다.
 *
 * ## 이 스크립트는 `npm test` 에 들어가지 않는다
 *
 * 모델을 불러서 돈과 시간이 든다. **비용 없이 검사할 수 있는 코퍼스 불변식은
 * `scripts/smoke.mts` 가 이미 하고 있다**(원문이 검사를 통과하지 않는가, 깨끗한 말을
 * 버리지 않는가, 약속한 낱말만 가리는가).
 *
 * `--strict` 를 주면 계약(거절 0 · 욕설 잔존 0)을 어긴 모델에서 종료 코드가 1이 된다.
 */

/** `--models a,b` · `--level NORMAL` · `--strict` */
function readArgs(): { models: string[]; level?: CushionLevelKey; strict: boolean } {
  const argv = process.argv.slice(2);
  const pick = (flag: string) => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  const models = (pick("--models") ?? "openrouter/free").split(",").map((m) => m.trim()).filter(Boolean);
  const level = pick("--level") as CushionLevelKey | undefined;
  return { models, level, strict: argv.includes("--strict") };
}

type Row = {
  id: string;
  refused: boolean;
  valid: number;
  toxic: number;
  lost: number;
  seconds: number;
};

async function runProvider(id: string, cases: CorpusCase[]): Promise<Row[]> {
  const provider = providerById(id);
  const tone = "soft";
  const rows: Row[] = [];

  // **단계별로 한 묶음으로** 부른다 — 화면이 하는 것과 똑같이(묶음 1회 = AI 1회).
  const byLevel = new Map<CushionLevelKey, CorpusCase[]>();
  for (const item of cases) {
    const list = byLevel.get(item.level) ?? [];
    list.push(item);
    byLevel.set(item.level, list);
  }

  for (const [level, group] of byLevel) {
    const started = Date.now();
    let result: { raw: string; refused: boolean };
    try {
      result = await softenIncoming(
        group.map((c) => ({ id: c.id, text: c.text })),
        tone,
        level,
        provider,
      );
    } catch (error) {
      // 한 묶음이 통째로 실패하면 그 단계는 전부 실패로 친다 — 숨기지 않는다.
      const seconds = (Date.now() - started) / 1000;
      for (const c of group) rows.push({ id: c.id, refused: true, valid: 0, toxic: 0, lost: 0, seconds });
      console.error(`  (${id} · ${level}) 호출 실패: ${(error as Error).message}`);
      continue;
    }
    const seconds = (Date.now() - started) / 1000 / group.length;
    const parsed = parsePurifyResponse(result.raw);
    const judged = judgeAll(
      group.map((c) => ({ id: c.id, text: c.text })),
      parsed,
      level,
    );
    for (const [index, item] of group.entries()) {
      const verdict = judged.find((j) => j.id === item.id);
      const text = verdict?.status === "PURIFIED" ? (verdict.text ?? "") : "";
      rows.push({
        id: item.id,
        refused: result.refused,
        valid: verdict?.status === "PURIFIED" ? 1 : 0,
        toxic: text ? item.drop.filter((w) => text.includes(w)).length : 0,
        lost: text ? item.keep.filter((k) => !text.includes(k)).length : 0,
        seconds,
      });
    }
  }
  return rows;
}

function summarize(model: string, rows: Row[]) {
  const sum = (pick: (row: Row) => number) => rows.reduce((acc, row) => acc + pick(row), 0);
  const total = rows.length;
  const refused = sum((r) => (r.refused ? 1 : 0));
  const valid = sum((r) => r.valid);
  const toxic = sum((r) => r.toxic);
  const lost = sum((r) => r.lost);
  const avg = sum((r) => r.seconds) / (total || 1);
  return { model, total, refused, valid, toxic, lost, avg };
}

const { models, level, strict } = readArgs();
const cases = level ? CUSHION_CORPUS.filter((c) => c.level === level) : CUSHION_CORPUS;

console.log(`읽기 순화 벤치 · 말 ${cases.length}개${level ? ` · ${level}` : " · 전체 단계"}`);
console.log(`코퍼스: scripts/cushion-corpus.mts\n`);

const table: Array<ReturnType<typeof summarize>> = [];
for (const model of models) {
  console.log(`— ${model} 부르는 중…`);
  const rows = await runProvider(model, cases);
  table.push(summarize(model, rows));

  // 문제가 있는 항목은 **몇 개만** 찍는다 — 100개짜리를 다 찍으면 읽을 수 없다.
  const bad = rows.filter((r) => r.toxic > 0 || r.lost > 0);
  for (const row of bad.slice(0, 8)) {
    const item = cases.find((c) => c.id === row.id);
    console.log(`    ⚠ ${row.id} ${row.toxic > 0 ? "욕설 잔존" : ""}${row.lost > 0 ? " 의미 손실" : ""} · ${item?.text ?? ""}`);
  }
}

console.log(`\n${"모델".padEnd(38)}${"거절".padStart(5)}${"유효".padStart(5)}${"욕설잔존".padStart(9)}${"의미손실".padStart(9)}${"말당초".padStart(8)}`);
for (const row of table) {
  console.log(
    [
      row.model.slice(0, 37).padEnd(38),
      `${row.refused}/${row.total}`.padStart(5),
      `${row.valid}/${row.total}`.padStart(5),
      String(row.toxic).padStart(9),
      String(row.lost).padStart(9),
      row.avg.toFixed(1).padStart(8),
    ].join(""),
  );
}
console.log(`\n유효 비율 = 검사를 통과한 비율. **욕설 잔존이 0 이 아니면 그 수치를 믿으면 안 된다.**`);

if (strict) {
  const broken = table.filter((row) => row.toxic > 0 || row.lost > 0);
  if (broken.length > 0) {
    console.error(`\n✗ ${broken.length}개 모델이 계약을 어겼다.`);
    process.exit(1);
  }
}
