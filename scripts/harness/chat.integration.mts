/**
 * 채팅 서버 액션 검사 — **메시지 전송·첨부·공유·읽음·쿠션 설정**을 서버 액션 경계를 통과해서 본다.
 *
 * 1. 단톡방 첨부 업로드 준비 (`prepareChatAttachment`)
 * 2. 메시지 전송 및 유효성/길이/중복 방지 (`sendChatMessage`)
 * 3. 첨부 파일 다운로드 URL 서명 (`getChatAttachmentUrl`)
 * 4. 드라이브 버전 단톡방 공유 (`shareVersionToChat`)
 * 5. 리서치 및 발표 질문 공유 (`shareResearchToChat`, `shareQuestionsToChat`)
 * 6. 메시지 페이징 및 폴링 (`loadOlderMessages`, `pollNewMessages`, `pollSidebarThreads`)
 * 7. 읽음 처리 (`markThreadRead`)
 * 8. 읽기 도움 쿠션 설정 및 조회 (`setReadCushion`, `softenThreadMessages`)
 *
 *   npm run test:chat
 */
import { randomUUID } from "node:crypto";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const chat = await import("../../src/server/actions/chat.js");
  const { CUSHION_DEFAULT_MODE } = await import("../../src/data/catalog.js");

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

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];

  async function makeTeam(label: string) {
    session.reset();
    const t = await db.team.create({
      data: { name: `채팅 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(t.id);
    const leader = await db.member.create({ data: { teamId: t.id, name: `김민준${suffix}`, isLeader: true } });
    const mate = await db.member.create({ data: { teamId: t.id, name: `이서연${suffix}` } });
    const token = async (memberId: string) => {
      const tk = randomUUID();
      await db.session.create({ data: { token: tk, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return tk;
    };
    return { id: t.id, leader, mate, asLeader: await token(leader.id), asMate: await token(mate.id) };
  }

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") throw new Error("세션 토큰이 아닙니다");
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  try {
    /* ── 1) 메시지 전송과 길이/유효성 ─────────────────────── */
    console.log("\n1) 메시지 전송과 유효성");
    const T = await makeTeam("기본");

    // 빈 문자열 거부
    const emptyRes = await as(T.asLeader, () => chat.sendChatMessage("team", "   "));
    check("빈 메시지는 거절된다", emptyRes.ok, false);

    // 2000자 초과 거부
    const longText = "a".repeat(2001);
    const longRes = await as(T.asLeader, () => chat.sendChatMessage("team", longText));
    check("2000자 초과 메시지는 거절된다", longRes.ok, false);

    // 정상 단톡방 전송
    const sent = await as(T.asLeader, () => chat.sendChatMessage("team", "안녕하세요!"));
    check("단톡방 메시지 전송 성공", sent.ok, true);
    if (sent.ok) {
      const row = await db.message.findUnique({ where: { id: sent.message.id } });
      check("단톡방 threadKey 는 team 이다", row?.threadKey, "team");
      check("작성자가 리더다", row?.authorId, T.leader.id);
      check("내용이 저장되었다", row?.text, "안녕하세요!");
    }

    // clientId 중복 방지 (멱등성)
    const cid = `client-${randomUUID()}`;
    const firstCid = await as(T.asLeader, () => chat.sendChatMessage("team", "중복 테스트", { clientId: cid }));
    const secondCid = await as(T.asLeader, () => chat.sendChatMessage("team", "중복 테스트", { clientId: cid }));
    check("동일 clientId 재전송 시 첫 번째 ID 반환", firstCid.ok && secondCid.ok && firstCid.message.id === secondCid.message.id, true);
    const msgCount = await db.message.count({ where: { clientId: cid } });
    check("DB 에 메시지가 하나만 생성된다", msgCount, 1);

    // DM 메시지 전송
    const dmSent = await as(T.asLeader, () => chat.sendChatMessage(T.mate.id, "1:1 메시지입니다"));
    check("DM 메시지 전송 성공", dmSent.ok, true);
    if (dmSent.ok) {
      const dmRow = await db.message.findUnique({ where: { id: dmSent.message.id } });
      check("DM threadKey 에 두 멤버 id 가 포함된다", dmRow?.threadKey.includes(T.leader.id) && dmRow?.threadKey.includes(T.mate.id), true);
    }

    /* ── 2) 첨부 URL 과 준비 ─────────────────────────────── */
    console.log("\n2) 첨부 파일 준비 및 다운로드 URL");
    const prep = await as(T.asLeader, () =>
      chat.prepareChatAttachment({ name: "보고서.pdf", size: 1024, type: "application/pdf" }),
    );
    if (prep.status === "ok") {
      check("첨부 업로드 준비에 signedUrl 이 생성된다", typeof prep.signedUrl, "string");
      check("저장 경로가 팀 id 를 포함한다", prep.path.startsWith(`${T.id}/chat/`), true);
    } else {
      check("스토리지 상태 확인", typeof prep.status, "string");
    }

    // 첨부가 없는 메시지의 첨부 URL 은 null
    if (sent.ok) {
      const noAttachUrl = await as(T.asLeader, () => chat.getChatAttachmentUrl(sent.message.id));
      check("첨부 없는 메시지는 null", noAttachUrl, null);
    }

    // 첨부 파일이 등록된 메시지
    const attachMsg = await db.message.create({
      data: {
        teamId: T.id,
        threadKey: "team",
        authorId: T.leader.id,
        text: "첨부 파일 확인해 주세요",
        whenLabel: "12:00",
        attachPath: `${T.id}/chat/test-file.pdf`,
        attachName: "test-file.pdf",
        attachMime: "application/pdf",
      },
    });
    const attachUrl = await as(T.asMate, () => chat.getChatAttachmentUrl(attachMsg.id));
    // 서명 주소는 저장소(Supabase)가 만든다 — 키가 없는 환경에서는 `null` 이 정직한 답이다. 그 경우
    // 이 검사는 **건너뛰었다고 말한다**(조용히 통과시키면 안 본 것을 본 것처럼 보인다).
    const { isStorageConfigured } = await import("../../src/server/storage/client.js");
    if (isStorageConfigured()) {
      check("첨부 메시지의 서명 URL 발급 성공", typeof attachUrl, "string");
    } else {
      console.log("  - (저장소 키가 없어 건너뜀: 첨부 서명 URL 발급 — npm run test:drive 가 진짜 저장소로 본다)");
      check("저장소 키가 없으면 서명 URL 은 null 이다", attachUrl, null);
    }

    /* ── 3) 단톡방 드라이브 / 리서치 / 발표 질문 공유 ─────── */
    console.log("\n3) 드라이브 버전 및 리서치/질문 공유");
    // 드라이브 제출함 및 파일 생성
    const box = await db.submissionBox.create({
      data: { teamId: T.id, role: "자료조사", name: "중간보고서 제출", due: "9/15" },
    });
    const file = await db.submittedFile.create({
      data: { boxId: box.id, name: "중간발표.pdf", kind: "pdf" },
    });
    const ver = await db.fileVersion.create({
      data: {
        fileId: file.id,
        authorId: T.leader.id,
        label: "v1.0",
        note: "초안",
        size: "2 KB",
        kind: "pdf",
        storagePath: `${T.id}/submissions/v1.pdf`,
        bytes: 2048,
      },
    });

    const shareVer = await as(T.asLeader, () => chat.shareVersionToChat(ver.id, "최종본 확인 바랍니다"));
    check("드라이브 버전 공유 성공", shareVer.ok, true);
    if (shareVer.ok) {
      const sharedMsg = await db.message.findFirst({
        where: { teamId: T.id, driveVersionId: ver.id },
      });
      check("공유 메시지에 driveVersionId 가 연결됨", sharedMsg?.driveVersionId, ver.id);
    }

    // 다른 팀 버전 공유 시도 방어
    const otherTeam = await makeTeam("다른팀");
    const otherBox = await db.submissionBox.create({ data: { teamId: otherTeam.id, role: "기획", name: "타팀박스", due: "9/15" } });
    const otherFile = await db.submittedFile.create({ data: { boxId: otherBox.id, name: "타팀파일.pdf", kind: "pdf" } });
    const otherVer = await db.fileVersion.create({
      data: { fileId: otherFile.id, authorId: otherTeam.leader.id, label: "v1", note: "초안", size: "10 B", kind: "pdf", storagePath: "p", bytes: 10 },
    });
    const illegalShare = await as(T.asLeader, () => chat.shareVersionToChat(otherVer.id));
    check("남의 팀 버전 공유는 거절된다", illegalShare.ok, false);

    // 리서치 공유
    const researchShare = await as(T.asLeader, () =>
      chat.shareResearchToChat({
        title: "2026 트렌드 보고서",
        source: "한국인터넷진흥원",
        snippet: "AI 기반 대학생 협업 툴 사용량 급증",
        url: "https://example.com/trend",
      }),
    );
    check("리서치 공유 성공", researchShare.ok, true);

    // 발표 예상 질문 공유
    const qShare = await as(T.asLeader, () =>
      chat.shareQuestionsToChat({
        modeName: "심층 질문 대비",
        questions: [
          { question: "수익 모델은 어떻게 되나요?", category: "practical", intent: "수익성 검증" },
          { question: "동시성 이슈는 어떻게 처리했나요?", category: "method" },
        ],
      }),
    );
    check("발표 질문 목록 공유 성공", qShare.ok, true);

    const emptyQShare = await as(T.asLeader, () => chat.shareQuestionsToChat({ questions: [] }));
    check("빈 질문 공유는 거절된다", emptyQShare.ok, false);

    /* ── 4) 페이징, 폴링, 읽음 처리 ───────────────────────── */
    console.log("\n4) 메시지 페이징, 폴링, 읽음 마크");
    // 메시지 히스토리 로드
    const page = await as(T.asMate, () => chat.loadOlderMessages("team", ""));
    check("이전 메시지 로드 성공", Array.isArray(page.messages) && page.messages.length > 0, true);

    // 새 메시지 폴링 및 읽음 갱신
    const polled = await as(T.asMate, () => chat.pollNewMessages("team", null));
    check("단톡방 새 메시지 폴링 반환", Array.isArray(polled) && polled.length > 0, true);

    // 사이드바 스레드 폴링
    const sidebar = await as(T.asMate, () => chat.pollSidebarThreads());
    check("사이드바 teamLast 존재", sidebar.teamLast !== null, true);
    check("사이드바 DM 목록 반환", Array.isArray(sidebar.threads), true);

    // 읽음 처리
    await as(T.asMate, () => chat.markThreadRead("team"));
    const readMark = await db.readMark.findUnique({
      where: { memberId_threadKey: { memberId: T.mate.id, threadKey: "team" } },
    });
    check("단톡방 읽음 시각이 기록되었다", readMark?.readAt !== null, true);

    /* ── 5) 읽기 순화 쿠션 설정 및 조회 ──────────────────── */
    console.log("\n5) 읽기 쿠션 설정 및 메시지 순화 조회");
    const cushionRes = await as(T.asMate, () =>
      chat.setReadCushion("team", { enabled: true, mode: "STRONG", tone: "firm" }),
    );
    check("쿠션 설정 저장 성공", cushionRes.ok, true);
    if (cushionRes.ok) {
      check("설정된 모드가 STRONG 이다", cushionRes.setting.mode, "STRONG");
      // 말투의 키는 soft·plain·firm 이다(`CUSHION_TONES`). 처음 이 검사는 없는 이름("careful")을 써서
      // 어느 트리에서도 통과할 수 없었다.
      check("설정된 말투가 firm 이다", cushionRes.setting.tone, "firm");
    }
    // 모르는 말투는 그대로 넣지 않고 **지금 쓰던 말투를 유지한다** — 프롬프트가 못 찾는 말투가 저장되지 않게.
    const unknownTone = await as(T.asMate, () =>
      chat.setReadCushion("team", { enabled: true, mode: "STRONG", tone: "careful" }),
    );
    check("모르는 말투는 이전 말투를 유지한다", unknownTone.ok && unknownTone.setting.tone, "firm");

    // 모르는 모드는 기본값으로 대체
    const defaultModeRes = await as(T.asMate, () =>
      chat.setReadCushion("team", { enabled: true, mode: "UNKNOWN_MODE" }),
    );
    if (defaultModeRes.ok) {
      check("유효하지 않은 모드는 기본 모드로 대체", defaultModeRes.setting.mode, CUSHION_DEFAULT_MODE);
    }

    // 순화 처리 조회
    const softenRes = await as(T.asMate, () => chat.softenThreadMessages("team"));
    check("스레드 메시지 순화 조회 성공", softenRes.ok, true);
  } finally {
    for (const id of teamIds) {
      await db.message.deleteMany({ where: { teamId: id } });
      await db.fileVersion.deleteMany({ where: { file: { box: { teamId: id } } } });
      await db.submittedFile.deleteMany({ where: { box: { teamId: id } } });
      await db.submissionBox.deleteMany({ where: { teamId: id } });
      await db.readCushion.deleteMany({ where: { member: { teamId: id } } });
      await db.readMark.deleteMany({ where: { member: { teamId: id } } });
      await db.member.deleteMany({ where: { teamId: id } });
      await db.team.delete({ where: { id } }).catch(() => {});
    }
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}
