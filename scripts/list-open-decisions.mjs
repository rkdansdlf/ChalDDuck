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
 * 1. **AI 하루 사용량 — 닫았다 (2026-09-28). 한도가 아니라 기록이다.**
 *
 *    순서는 **"어떤 모델" → "하루 몇 회"** 였고, 모델을 무료 라우터로 정했으므로 숫자를
 *    정하면 되는 줄 알았다. **결정하지 않고 측정했다.**
 *
 *    - 운영 14일 기록의 최고 하루가 도구 **18회**(있던 한도 200 의 9%), 순화 **1회**(400 의
 *      0.25%)였다. **한도에 닿은 날이 한 번도 없었고** 거절된 날도 없었다.
 *    - 무료 라우터가 **속도 한도로** 막은 적도 없다. 기록에 남은 실패는 안전 필터 거절 2건과
 *      60초 타임아웃 1건 — 한도와 무관한 실패였다.
 *
 *    그러니 14일간 아무 일도 하지 않은 숫자를 "하루 200회" 로 사용자에게 보여 주던 것은
 *    **한도가 아니라 거짓말**이었다. 숫자 네 개(200·60·400·120)를 **지웠다.**
 *
 *    지운 뒤 남긴 것은 두 가지다 — **보관 기간 90일**과 **읽기 순화 폭주 차단**(하루 5,000,
 *    사람 눈에 보이지 않는다). 도구는 사람이 누른다. **읽기 순화만 메시지마다 자동으로** 도므로
 *    여기만 방어선이 필요하다(관측치의 5,000배 — 한도가 아니라 회로 차단기다).
 *
 *    ⚠️ **지우면서 반드시 남긴 것: `AiUsage` 기록.** 오늘 이 질문에 5분 만에 답한 것이 이
 *    표였고, 기록을 지우면 **다음번에 같은 질문에 답할 수 없다.**
 *
 *    ⚠️ 유료 슬러그로 바꾸면 다시 숫자를 넣어야 한다. 그때는 근거를 **그때의 관측치**로
 *    세운다 — 지금처럼 예측으로 두지 않는다.
 * 2. **남의 상태를 바꾸는 권한 — 세 곳이 서로 다르다.** 2026-09-28 기준 실제 상태:
 *
 *    | 대상 | 지금 | 상태 |
 *    |---|---|---|
 *    | 담당자 지정 · 제목 · 기한 | **넣은 사람 + 팀장** | 정해짐(`lib/task-permission.ts`) |
 *    | 마감 수정(`setBoxDeadline`) | **팀원 누구나** | 미결 |
 *    | 파일 복원(`restoreFileVersion`) | **팀원 누구나** | 미결 |
 *    | **상태 변경(todo·doing·done)** | **팀원 누구나** | 미결 · 아무도 안 짚었다 |
 *
 *    마지막 줄이 실제 허점이다. **남의 업무를 남이 "다 했다"로 닫을 수 있다.** 담당자 지정은
 *    어제 막았는데 상태 변경은 그대로 남아 있다 — 어제 손대지 않은 것은 이 때문이다(수락
 *    제도라는 더 큰 결정이 따라붙어서). "누구나" 는 실수를 막지 못하고 사고가 난 뒤에야
 *    보인다는 이유로 기본값이 되기 어려운 선택이다.
 * 3. **재입장 때 사람을 어떻게 구분하는가 — 여기는 설명이 사실과 달랐다**(2026-09-28 정정).
 *
 *    예전 이 목록은 "동명이인이면 **기록이 하나가 된다**" 고 적었다. **틀렸다.** 기록은
 *    `memberId` 로 연결되므로 합쳐지지 않는다. 실제 일어난 것은 이다 —
 *
 *    - `Member` 에 `@@unique([teamId, name])` 이 있어 **두 번째 입장이 DB 수준에서 막힌다.**
 *    - 따라서 겹치는 이름의 두 사람이 **기록을 나눠 가지는 문제가 아니었다.** 둘째는 팀원이
 *      되지 못한 것이었다.
 *    - 그 사실을 숨기던 길이 하나 더 있었다. 팀장이 그 요청을 승인하면 **승인은 끝난 뒤** 신청인
 *      브라우저가 폴링할 때 제약이 터졌고, 그 예외는 "폴링이 겹쳤다" 고 읽혀 **요청을 조용히
 *      지웠다**. 막는 자리를 승인으로 옮겼고(`invite/settle.ts` 의 `"name-taken"`), 신청인에게는
 *      "같은 이름이 이미 있습니다 — 다른 이름으로 신청해 주세요" 라고 말한다.
 *
 *    남은 질문은 이것이다 — **같은 이름의 두 사람을 서로 다른 사람으로 구분할 길을 열 것인가.**
 *    열면 유일 제약을 떼야 하고(`Member`·`JoinRequest`), 명단·DM·기여 리포트·알림 어디에나 같은
 *    이름이 두 줄 생긴다. 어느 화면에서 어떻게 구별할지가 정해지기 전엔 손대지 않는다.
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
