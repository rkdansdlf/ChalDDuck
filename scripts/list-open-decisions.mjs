/**
 * 아직 정하지 않은 것의 목록.
 *
 * ## 왜 목록을 문서에 적지 않나
 *
 * 기획에 규칙이 없는 자리는 화면 안에 `Undecided` 상자로 표시된다(`src/lib/review-mode.tsx`).
 * 문제는 그것이 **화면마다 흩어져 있다**는 것이었다 — 20개가 넘는 화면에 하나씩 있어서, 무엇을
 * 정해야 하는지 한 번에 볼 자리가 없었다. 문서로 옮겨 적으면 그 문서가 또 코드와 어긋난다
 * (핸드오프 정책표가 정확히 그렇게 됐고, "AI 사용량 한도 없음" 이 한참을 거짓말이었다).
 *
 * 그래서 **목록을 만들지 않는다.** 화면에서 읽어 이력만 그린다. 한 곳에 모으는 순간 그
 * 목록이 갱신되는 일을 잊는다면, 미결이 줄지 않는다.
 *
 * ## 쓰는 법
 *
 *     npm run decisions
 *
 * 항목마다 지금 코드가 **어느 쪽으로 되어 있는지**가 함께 나온다. 그 기본값을 뒤집으면
 * 무엇이 달라지는지는 각 `Undecided` 안에 적혀 있고, 그 값은 화면에서도 그대로 보인다
 * (`?review=1`).
 *
 * ## 우선순위
 *
 * 목록만으로는 무엇부터 손대야 할지 보이지 않으므로, 아래를 먼저 본다.
 *
 * 1. **AI 한도 수치(팀 200회 · 1인 60회 · 90일)** — 손댈 수 없다. 이 숫자는 사용자 화면에
 *    그대로 보인다. 그리고 **어떤 모델을 붙였느냐에 따라 비용이 정해지지 않는다.** 무료 라우터
 *    (`OPENROUTER_MODEL="openrouter/free"`)면 한도를 넉넉히 둬도 지출이 붙지 않고, 유료 슬러그로
 *    바꾸면 호출 수에 비례해 오른다. 그래서 순서가 **"어떤 모델" → "하루 몇 회"** 이다. 모델을
 *    먼저 정하지 않으면 숫자는 고정이 아니라 나중의 재작업이 된다.
 * 2. **남에게 보이는 기록의 권한** — 마감 수정, 파일 복원, 담당자 지정. 지금은 전부 **누구나**
 *    가 된다. "누구나" 는 실수를 막지 못하고 사고가 난 뒤에야 보인다는 이유로 기본값이 되기
 *    어려운 선택이라, 규칙이 있는지 없는지부터 정해 두는 편이 낫다.
 * 3. **재입장 때 사람을 어떻게 구분하는가** — 지금은 이름이 유일해야 하므로 **동명이인이면 기록이
 *    하나가 된다.** 팀이 4명이라 해도 같은 이름이 나올 수 있고, 그러면 두 사람의 기여 기록이
 *    합쳐진다.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { stripComments } from "./strip-comments.mjs";
import { join, relative } from "node:path";

const ROOTS = ["src/features", "src/app"];
const SKIP = new Set(["node_modules", "generated", ".next", "prototype"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith(".tsx")) yield full;
  }
}

/**
 * `Undecided` 의 본문을 한 줄로 만든다.
 *
 * JSX 를 그대로 읽으면 태그와 표현식 컨테이너가 섞여 읽을 수 없다. 두 가지를 따로 걷어낸다.
 *
 * - **태그** — `<b>`, `&ldquo;` 같은 것.
 * - **표현식 컨테이너** — `{" "}` 은 공백이고, `{total}` 은 값이 아니라 **값이 들어갈 자리**다.
 *   숫자는 이 스크립트가 모른다(화면 안에서 계산된다) 그래서 지우지 않고 이름만 남긴다.
 *   지우면 "이 문항의 정확도" 가 되어 어느 화면의 몇 문항인지 사라진다.
 */
function plainText(jsx) {
  return (
    jsx
      .replace(/<[^>]+>/g, "")
      // `{" "}` · `{ ' ' }` 처럼 따옴표만 든 컨테이너는 공백이다. 닫는 따옴표를 빠뜨리면
      // 이 정규식이 `{" "}` 를 못 잡는다(닫는 따옴표가 없어 `}` 를 바로 요구하게 된다).
      .replace(/\{\s*(["'])\s*\1\s*\}/g, " ")
      // 남은 컨테이너는 안쪽 이름을 남긴다 — `{total}` → `total`.
      .replace(/\{\s*([^<>{}]*?)\s*\}/g, "$1")
      // 화면에 실제로 보이는 문자 그대로 읽히게 한다. `&ldquo;` 가 그대로 남으면 그게
      // 사람이 쓰는 문장처럼 보인다.
      .replace(/&(ldquo|rdquo|lsquo|rsquo|hellip|middot|nbsp|amp|lt|gt);/g, (_, name) => {
        const named = { ldquo: "\u201C", rdquo: "\u201D", lsquo: "\u2018", rsquo: "\u2019", hellip: "\u2026", middot: "\u00B7", nbsp: " ", amp: "&", lt: "<", gt: ">" };
        return named[name] ?? "";
      })
      .replace(/\s+/g, " ")
      .trim()
  );
}

const found = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    // **주석을 지운 뒤에 센다.** 두 이유가 있다 —
    //
    // ① 주석 안에 적힌 `<Undecided>` 은 목록에 **아니어야** 한다. 주석 처리된 항목을
    //    "확인이 필요한 정책" 으로 세면 목록이 거짓말을 한다(2026-09-28 실제로 두 번 그렇게
    //    깨졌다 — `notify` 와 `confirm-due` 의 검사).
    // ② 아래에서 중괄호 깊이를 세어 항목의 끝을 찾는데, 주석 안에 균형이 맞지 않는 중괄호가
    //    하나만 있어도 끝을 잘못 잡는다. 지우면 그 위험도 함께 사라진다.
    const source = stripComments(readFileSync(file, "utf8"));
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes("<Undecided")) continue;
      const start = i;
      let depth = 0;
      let body = "";
      for (let j = i; j < lines.length; j += 1) {
        body += `${lines[j]}\n`;
        depth += (lines[j].match(/<Undecided/g) ?? []).length;
        depth -= (lines[j].match(/<\/Undecided>/g) ?? []).length;
        if (depth === 0 && j > i) break;
        if (depth === 0 && lines[j].includes("/>")) break;
      }
      found.push({
        file: relative(".", file),
        line: start + 1,
        text: plainText(body.replace(/<\/?Undecided[^>]*>/g, "")),
      });
      i = lines.length > i ? start : i;
    }
  }
}

found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

console.log(`\n아직 정하지 않은 것 ${found.length}건\n`);
let current = "";
for (const item of found) {
  if (item.file !== current) {
    current = item.file;
    console.log(`── ${current}`);
  }
  console.log(`   ${String(item.line).padStart(4)}  ${item.text}`);
}
console.log(
  [
    "",
    "기본값과 뒤집었을 때의 차이는 각 항목 안에 적혀 있다.",
    "화면에서도 그대로 보인다 — `?review=1` 을 붙여 그 화면을 열면 점선 상자로 보인다.",
    "스크립트 머리말에 우선순위 세 가지가 적혀 있다.",
    "",
  ].join("\n"),
);
