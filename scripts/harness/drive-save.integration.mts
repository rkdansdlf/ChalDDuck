/**
 * 리서치 결과 → 드라이브 PDF 저장 검사 — **저장된 파일을 실제로 열어 읽는다.**
 *
 * ## 왜 이게 필요한가
 *
 * `saveResearchToDrive` 는 PDF 를 손으로 짰다. 한글을 Helvetica 에 UTF-8 바이트째 넣어서
 * `pdftotext` 로 열면 `º·· Œ‚ ºfl‚„º` 가 나왔고, 본문은 200자에서 잘려 URL 이 `https://e` 에서
 * 끊겼으며, 한 줄로 써서 페이지 폭을 넘었다. **"PDF 로 저장된다 / 종류는 pdf 다 / 바이트가
 * 있다" 는 기존 검사는 전부 초록불이었다** — 파일이 읽히는지는 아무도 열어 보지 않았기 때문이다.
 *
 * 그래서 여기서는 만든 파일을 **poppler(`pdftotext`·`pdfinfo`·`pdffonts`)로 연다.** 뷰어가
 * 읽을 수 있는 파일인지는 우리가 쓴 코드가 아니라 뷰어에게 묻는다.
 *
 * ## 두 겹
 *
 * 1. **본문 생성 함수**(`makeResearchPdf`)를 직접 불러 글자·줄바꿈·쪽·글꼴을 본다. DB 가 필요 없다.
 * 2. **서버 액션**을 통과해 저장소에 올라간 *바이트*를 꺼내 같은 검사를 한다. 함수만 맞고
 *    액션이 그것을 쓰지 않거나 다른 값을 넘기면 1번만으로는 못 잡는다. 저장소는 이 프로세스 안의
 *    가짜 서버다(`drive-save.mts`).
 *
 *   npm run test:drive-save        (로컬 DB 와 poppler 필요)
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { makeResearchPdf } from "../../src/server/drive/research-pdf.js";

type Session = { as(token: string): void; nobody(): void };
type Objects = Map<string, { body: Buffer; contentType: string }>;

/** 쪽 폭(595pt)과 왼쪽 여백(56pt) — `research-pdf.ts` 와 같은 값이어야 "폭 안에 들어온다" 가 의미를 갖는다. */
const PAGE_W = 595;
const MARGIN_X = 56;

const tmp = mkdtempSync(path.join(tmpdir(), "drive-save-"));

function poppler(tool: string, args: string[], bytes: Buffer): { out: string; err: string; status: number | null } {
  // pdftotext 는 마지막에 `-` 를 줘야 파일이 아니라 표준 출력으로 낸다.
  const file = path.join(tmp, `${randomUUID()}.pdf`);
  writeFileSync(file, bytes);
  const r = spawnSync(tool, [...args, file, ...(tool === "pdftotext" ? ["-"] : [])], { encoding: "utf8" });
  if (r.error) {
    throw new Error(`${tool} 를 실행할 수 없습니다 (${r.error.message}) — poppler 가 필요합니다. macOS: brew install poppler`);
  }
  return { out: r.stdout, err: r.stderr, status: r.status };
}

/** 뷰어가 읽은 글자. 줄바꿈·공백 차이는 지운다 — 줄이 어디서 끊겼는지는 이 검사의 관심이 아니다. */
const squash = (s: string) => s.replace(/\s+/g, "");
const textOf = (bytes: Buffer) => poppler("pdftotext", ["-q", "-enc", "UTF-8"], bytes).out.replace(/\f/g, "\n");
const pagesOf = (bytes: Buffer) => Number(/Pages:\s+(\d+)/.exec(poppler("pdfinfo", [], bytes).out)?.[1] ?? 0);

/** 글자 하나하나의 오른쪽 끝 좌표 중 가장 큰 값 — 쪽 밖으로 나간 글자가 있는지 본다. */
function rightmostX(bytes: Buffer): number {
  const html = poppler("pdftotext", ["-q", "-bbox"], bytes).out;
  let max = 0;
  for (const m of html.matchAll(/xMax="([\d.]+)"/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export async function run({ session, objects }: { session: Session; objects: Objects }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const actions = await import("../../src/server/actions/drive.js");

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
  const truthy = (what: string, got: unknown) => check(what, Boolean(got), true);

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];

  try {
    /* ── 1. 본문 생성 함수 ─────────────────────────────────── */
    console.log("\n한글 리서치 결과를 PDF 로 만든다 (함수)");

    const TITLE = "수면이 기억에 미치는 영향";
    const SOURCE = "한국심리학회지";
    // 한 줄(483pt)을 훨씬 넘는 주소 — 예전에는 200자에서 잘려 `https://e` 에서 끊겼다.
    const URL_LONG =
      "https://example.org/research/sleep-and-memory/2021/korean-adolescents/longitudinal-study?doi=10.1234/abcd.2021.05678&lang=ko";
    // 문단 둘, 200자를 넘는다. 어절·문장부호·숫자·괄호·영문이 섞여 있다.
    const SNIPPET = [
      "수면 시간이 짧아지면 새로 배운 내용을 오래 기억하는 능력이 눈에 띄게 떨어진다. 특히 시험 직전에 밤을 새운 학생은 같은 시간을 공부하고도 이튿날 회상률이 약 23% 낮았다(n=412, p<.01).",
      "연구진은 렘수면(REM) 동안 낮에 학습한 정보가 장기 기억으로 옮겨 간다고 설명한다. 따라서 팀플 발표 전날에는 자료를 한 번 더 훑는 것보다 충분히 자는 편이 낫다는 해석이 가능하다.",
    ].join("\n");
    const CITATION = "김하늘, 박도윤 (2021). 청소년의 수면과 기억 공고화. 한국심리학회지, 40(3), 211-238.";

    const full = await makeResearchPdf({
      title: TITLE,
      source: SOURCE,
      year: "2021",
      snippet: SNIPPET,
      url: URL_LONG,
      citation: CITATION,
    });
    check("PDF 머리말이 있다", full.subarray(0, 5).toString(), "%PDF-");

    const info = poppler("pdfinfo", [], full);
    check("뷰어가 구조를 오류 없이 연다 (xref·startxref)", { status: info.status, err: info.err }, { status: 0, err: "" });
    const read = poppler("pdftotext", ["-enc", "UTF-8"], full);
    check("글자를 읽을 때 오류가 없다", read.err, "");

    const text = squash(read.out);
    truthy("제목이 그대로 나온다", text.includes(squash(TITLE)));
    truthy("출처가 그대로 나온다", text.includes(squash(SOURCE)));
    truthy("연도가 나온다", text.includes("(2021)"));
    truthy("원문 주소가 끝까지 나온다", text.includes(URL_LONG));
    truthy("참고문헌 인용이 나온다", text.includes(squash(CITATION)));
    truthy("요약 첫 문단이 끝까지 나온다 (200자에서 안 잘린다)", text.includes(squash(SNIPPET.split("\n")[0])));
    truthy("요약 둘째 문단이 끝까지 나온다", text.includes(squash(SNIPPET.split("\n")[1])));
    check("깨진 글자(Latin-1 로 읽힌 한글)가 없다", /[º¼¾Œ‚„]/.test(read.out), false);

    // 줄바꿈 — 한 줄이 아니고, 어떤 글자도 쪽 밖으로 나가지 않는다.
    const lines = read.out.split("\n").filter((l) => l.trim() !== "");
    truthy("여러 줄이다", lines.length > 6);
    const right = rightmostX(full);
    truthy(`모든 글자가 오른쪽 여백 안이다 (${right.toFixed(0)}pt ≤ ${PAGE_W - MARGIN_X}pt)`, right > 0 && right <= PAGE_W - MARGIN_X + 0.5);

    // 글꼴 — 한글 글꼴이 파일 안에 들어 있다(뷰어에 글꼴이 없어도 같게 보인다).
    const fonts = poppler("pdffonts", [], full).out;
    truthy("글꼴이 PDF 안에 들어 있다", /\byes\b/.test(fonts.split("\n").slice(2).join("\n")));
    check("표준 글꼴(Helvetica)에 기대지 않는다", fonts.includes("Helvetica"), false);
    // 글꼴 전체(5MB)가 아니라 쓴 글리프만 — 함수 응답과 저장소 용량을 지킨다.
    truthy(`서브셋이다 (${(full.length / 1024).toFixed(0)}KB < 300KB)`, full.length < 300 * 1024);

    console.log("\n길이·글자 처리");

    const huge = await makeResearchPdf({
      title: "긴 요약",
      source: "출처",
      snippet: Array.from({ length: 80 }, (_, i) => `${i + 1}번째 문단입니다. 이 문장은 쪽을 넘기기 위해 반복해서 쓴 한국어 문장입니다.`).join("\n"),
    });
    truthy("길면 쪽이 늘어난다", pagesOf(huge) >= 2);
    truthy("쪽이 늘어도 마지막 문단까지 나온다", squash(textOf(huge)).includes("80번째문단입니다"));
    truthy("첫 쪽 글자도 그대로다", squash(textOf(huge)).includes("1번째문단입니다"));

    const tokenOnly = await makeResearchPdf({ title: "긴 단어", source: "출처", snippet: "가".repeat(400) });
    truthy("공백 없는 긴 단어도 글자를 버리지 않고 쪽 안에서 끊는다", squash(textOf(tokenOnly)).includes("가".repeat(400)));
    truthy("공백 없는 긴 단어도 쪽 밖으로 나가지 않는다", rightmostX(tokenOnly) <= PAGE_W - MARGIN_X + 0.5);

    // 자모로 풀린(NFD) 한글 — macOS 파일 이름·복사본에서 흔하다. 글꼴에는 완성형만 있다.
    const nfd = await makeResearchPdf({ title: "한국어".normalize("NFD"), source: "출처", snippet: "내용" });
    truthy("풀어쓴 한글도 완성형으로 읽힌다", textOf(nfd).includes("한국어"));

    // 한자·기호 — 한국어 논문 제목에 흔하다.
    const hanja = await makeResearchPdf({ title: "㈜찰떡과 韓國의 팀플 — “협업”", source: "出處", snippet: "내용" });
    const hanjaText = textOf(hanja);
    truthy("한자·㈜·따옴표가 나온다", ["㈜찰떡", "韓國", "“협업”", "出處"].every((s) => hanjaText.includes(s)));

    // 글꼴에 없는 글자(이모지)는 사라지지 않고 `?` 로 남는다 — 앞뒤 글자는 그대로.
    const emoji = await makeResearchPdf({ title: "좋은😀자료", source: "출처", snippet: "내용" });
    truthy("없는 글자는 ? 로 남고 앞뒤는 온전하다", textOf(emoji).includes("좋은?자료"));

    // 값이 비어도 죽지 않는다 — 출처·주소·연도는 없을 수 있다.
    const bare = await makeResearchPdf({ title: "제목만", source: "", snippet: "", url: null, year: null, citation: null });
    check("제목만 있어도 PDF 가 열린다", { status: poppler("pdfinfo", [], bare).status, text: squash(textOf(bare)) }, { status: 0, text: "제목만" });

    // 제어 문자와 CRLF — 모델 응답에 섞여 들어온다.
    const crlf = await makeResearchPdf({ title: "제어\u0000문자", source: "출처", snippet: "첫 줄\r\n둘째 줄\u200b끝" });
    truthy("제어 문자를 지우고 CRLF 를 줄바꿈으로 읽는다", ["제어문자", "첫줄", "둘째줄끝"].every((s) => squash(textOf(crlf)).includes(s)));

    /* ── 2. 서버 액션 → 저장소에 올라간 바이트 ───────────────── */
    console.log("\n서버 액션이 저장소에 올린 파일을 읽는다");

    const team = await db.team.create({
      data: { name: `리서치 저장 검사 ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(team.id);
    const mate = await db.member.create({ data: { teamId: team.id, name: `이서연${suffix}` } });
    const box = await db.submissionBox.create({ data: { teamId: team.id, role: "research", name: "자료", due: "10/1" } });
    const token = randomUUID();
    await db.session.create({ data: { token, memberId: mate.id, expiresAt: new Date(Date.now() + 3600_000) } });

    session.as(token);
    let saved;
    try {
      saved = await actions.saveResearchToDrive(box.id, {
        title: TITLE,
        source: SOURCE,
        year: "2021",
        snippet: SNIPPET,
        url: URL_LONG,
        citation: CITATION,
      });
    } finally {
      session.nobody();
    }
    check("저장된다", saved.ok, true);
    if (!saved.ok) throw new Error(`저장 실패: ${saved.error}`);
    check("파일 이름은 [자료] 제목.pdf", saved.fileName, `[자료] ${TITLE}.pdf`);

    const file = await db.submittedFile.findFirstOrThrow({ where: { boxId: box.id, name: saved.fileName } });
    const versions = await db.fileVersion.findMany({ where: { fileId: file.id }, orderBy: { createdAt: "asc" } });
    check("종류는 pdf, 버전은 하나", { kind: file.kind, n: versions.length }, { kind: "pdf", n: 1 });
    const v1 = versions[0]!;
    truthy("저장소 경로가 기록된다", v1.storagePath);

    const stored = objects.get(`${process.env.SUBMISSIONS_BUCKET}/${v1.storagePath}`);
    truthy("저장소에 객체가 올라갔다", stored);
    const storedBytes = stored!.body;
    check("올린 형식은 application/pdf", stored!.contentType, "application/pdf");
    check("DB 에 적힌 크기가 올라간 바이트와 같다", v1.bytes, storedBytes.length);

    const storedText = squash(textOf(storedBytes));
    truthy("저장된 파일에서 제목이 읽힌다", storedText.includes(squash(TITLE)));
    truthy("저장된 파일에서 출처와 연도가 읽힌다", storedText.includes(squash(SOURCE)) && storedText.includes("(2021)"));
    truthy("저장된 파일에서 원문 주소가 끝까지 읽힌다", storedText.includes(URL_LONG));
    truthy("저장된 파일에서 요약이 끝까지 읽힌다", storedText.includes(squash(SNIPPET.split("\n")[1])));
    check("저장된 파일을 뷰어가 오류 없이 연다", poppler("pdfinfo", [], storedBytes).err, "");

    // 같은 제목이면 같은 파일의 다음 버전 — 새 내용이 새 객체로 올라간다(옛 객체는 그대로).
    session.as(token);
    try {
      await actions.saveResearchToDrive(box.id, { title: TITLE, source: "다른출처", snippet: "고친내용입니다", url: "https://example.org/b" });
    } finally {
      session.nobody();
    }
    const versions2 = await db.fileVersion.findMany({ where: { fileId: file.id }, orderBy: { createdAt: "asc" } });
    check("버전이 늘었다", versions2.map((v) => v.label), ["v1", "v2"]);
    const stored2 = objects.get(`${process.env.SUBMISSIONS_BUCKET}/${versions2[1]!.storagePath}`);
    truthy("두 번째 버전에는 새 내용이 읽힌다", stored2 && squash(textOf(stored2.body)).includes("고친내용입니다"));
    truthy("첫 버전의 객체는 그대로다", objects.get(`${process.env.SUBMISSIONS_BUCKET}/${v1.storagePath}`)?.body.equals(storedBytes));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    for (const teamId of teamIds) {
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } });
    }
    await db.$disconnect();
  }

  console.log(
    failed === 0
      ? `\n모두 통과 — ${passed}건 통과, 0건 실패\n`
      : `\n${failed}건 실패 / ${passed}건 중\n`,
  );
  return failed === 0;
}
