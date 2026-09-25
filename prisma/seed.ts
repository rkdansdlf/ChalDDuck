import "../scripts/load-env.mjs";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { computeMeetingSlots } from "../src/features/schedule/meeting-slots.js";
// 앱과 같은 함수로 해시한다 — 형식이 어긋나면 로그인이 안 된다. 이 파일은 `server-only` 를
// 불러오는데, `db:seed` 가 `--conditions=react-server` 로 돌아 그 import 가 빈 모듈이 된다.
import { hashRejoinCode } from "../src/server/auth/rejoin-code.js";

/**
 * 데모 팀 한 개를 넣는다.
 *
 * 지금까지 `src/data/mock.ts` 에 있던 값을 그대로 옮긴 것이다 — 화면을 열었을 때
 * 빈 앱이 아니라 팀플이 한창인 모습이 보여야 흐름을 확인할 수 있다.
 *
 * 다시 실행하면 같은 초대 코드의 팀을 지우고 새로 넣는다(idempotent).
 */
// 시드는 CLI 처럼 직결 주소를 쓴다 — 풀러로는 대량 삽입이 중간에 끊긴다.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL 이 없습니다. `.env.example` 을 참고해 채워 주세요.");
}

// 시드는 같은 초대 코드의 팀을 **지우고** 다시 넣는다. 운영 DB 에서 잘못 돌면 실제 팀의
// 기록이 사라지므로, 로컬이 아니면 명시적으로 허락했을 때만 돈다.
const host = new URL(connectionString).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
if (!isLocal && process.env.ALLOW_REMOTE_SEED !== "1") {
  throw new Error(
    `시드가 로컬이 아닌 DB(${host})를 가리킵니다. 정말 그곳에 넣으려면 ALLOW_REMOTE_SEED=1 을 붙여 실행하세요.`,
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const TEAM_CODE = "CD3-7F2Q";

/**
 * 로컬에서 데모 팀원으로 들어가는 재입장 코드(/join/rejoin — 초대 코드 + 이름 + 이 코드).
 *
 * 네 사람이 같은 코드를 쓴다. 누구로 들어갈지는 이름이 정한다. **로컬 DB 에만 넣는다** —
 * 모두가 아는 코드가 운영 DB 에 들어가면 누구나 데모 팀원이 될 수 있는 뒷문이 된다.
 */
const DEMO_REJOIN_CODE = "DEMO-DEMO-DEMO";

async function main() {
  await prisma.team.deleteMany({ where: { code: TEAM_CODE } });

  const team = await prisma.team.create({
    data: {
      name: "디지털콘텐츠기획 3조",
      course: "디지털콘텐츠기획",
      code: TEAM_CODE,
      dday: "중간발표 D-12",
    },
  });

  const [minjun, seoyeon, jiho, yuna] = await Promise.all(
    [
      // 팀을 만든 사람이 팀장이다. 시드에서는 "나"인 김민준이 만든 것으로 본다.
      { name: "김민준", mbti: "INFJ", wantRole: "research", vetoRole: "present", isLeader: true },
      { name: "이서연", mbti: "ENFP", wantRole: "deck", vetoRole: "manage", isLeader: false },
      { name: "박지호", mbti: "ISTJ", wantRole: "manage", vetoRole: "present", isLeader: false },
      { name: "최유나", mbti: null, wantRole: "research", vetoRole: null, isLeader: false },
    ].map((m) =>
      prisma.member.create({
        data: { ...m, teamId: team.id, rejoinCodeHash: isLocal ? hashRejoinCode(DEMO_REJOIN_CODE) : null },
      }),
    ),
  );

  /* ── 08 내 시간표 ──────────────────────────────────────── */
  // 네 사람 모두 넣는다. 한 사람만 있으면 "모두 되는 시간"이 그 사람의 빈 시간일 뿐이다.
  const timetables: Array<[string, Array<{ day: number; startHour: number; hours: number; kind: string }>]> = [
    [
      minjun.id,
      [
        { day: 0, startHour: 1, hours: 3, kind: "class" },
        { day: 0, startHour: 6, hours: 2, kind: "work" },
        { day: 1, startHour: 0, hours: 2, kind: "class" },
        { day: 2, startHour: 3, hours: 2, kind: "class" },
        { day: 2, startHour: 7, hours: 3, kind: "work" },
        { day: 3, startHour: 1, hours: 2, kind: "class" },
        { day: 4, startHour: 2, hours: 2, kind: "class" },
        { day: 4, startHour: 6, hours: 2, kind: "work" },
      ],
    ],
    [
      seoyeon.id,
      [
        { day: 0, startHour: 5, hours: 3, kind: "class" },
        { day: 1, startHour: 2, hours: 2, kind: "class" },
        { day: 3, startHour: 0, hours: 2, kind: "class" },
        { day: 4, startHour: 5, hours: 2, kind: "work" },
      ],
    ],
    [
      jiho.id,
      [
        { day: 0, startHour: 0, hours: 2, kind: "class" },
        { day: 2, startHour: 6, hours: 4, kind: "work" },
        { day: 3, startHour: 6, hours: 4, kind: "work" },
        { day: 4, startHour: 1, hours: 2, kind: "class" },
      ],
    ],
    [
      yuna.id,
      [
        { day: 1, startHour: 6, hours: 3, kind: "exam" },
        { day: 2, startHour: 0, hours: 2, kind: "class" },
        { day: 3, startHour: 3, hours: 3, kind: "exam" },
        { day: 4, startHour: 0, hours: 2, kind: "class" },
      ],
    ],
  ];
  await prisma.busyBlock.createMany({
    data: timetables.flatMap(([memberId, blocks]) => blocks.map((b) => ({ ...b, memberId }))),
  });

  /* ── 09 / 10 회의 시간 후보 ────────────────────────────── */
  // 후보는 시드가 지어내지 않는다 — 앱이 쓰는 계산을 그대로 돌린다. 손으로 적어 두면
  // 시간표와 어긋난 후보가 데모에만 남는다.
  const members = [minjun, seoyeon, jiho, yuna];
  await prisma.meetingSlot.createMany({
    data: computeMeetingSlots(
      members.map((m, i) => ({ name: m.name, busyBlocks: timetables[i][1] })),
    ).map((s) => ({ ...s, teamId: team.id, weekKey: "this" })),
  });

  /* ── 12 / 13 / 22 드라이브 ─────────────────────────────── */
  const researchBox = await prisma.submissionBox.create({
    data: {
      teamId: team.id,
      role: "research",
      name: "자료조사 제출함",
      ownerId: minjun.id,
      due: "9/15",
      files: { create: { name: "자료조사 정리.docx", kind: "docx" } },
    },
    include: { files: true },
  });
  const deckBox = await prisma.submissionBox.create({
    data: {
      teamId: team.id,
      role: "deck",
      name: "PPT 제출함",
      ownerId: seoyeon.id,
      due: "9/20",
      files: { create: { name: "발표 자료.pptx", kind: "pptx" } },
    },
    include: { files: true },
  });
  await prisma.submissionBox.create({
    data: {
      teamId: team.id,
      role: "script",
      name: "발표 대본 제출함",
      ownerId: yuna.id,
      due: "9/22",
      // 아직 아무것도 올라오지 않은 제출함 — 빈 상태 화면을 보기 위해 파일도 두지 않는다.
    },
  });

  // 맨 앞이 최신이 되도록 오래된 것부터 넣는다(정렬은 createdAt 내림차순).
  const deckVersions = [
    { label: "v1", authorId: seoyeon.id, note: "템플릿 최초 업로드", size: "6.8MB", kind: "pptx", whenLabel: "9/11 14:20" },
    { label: "v2", authorId: seoyeon.id, note: "본문 폰트 통일", size: "7.1MB", kind: "pptx", whenLabel: "9/12 23:40" },
    {
      label: "img1",
      authorId: minjun.id,
      note: "설문 결과 그래프 (이미지 내보내기)",
      size: "1.1MB",
      kind: "image",
      previewUrl: "/assets/logo-app-icon.png",
      whenLabel: "9/13 15:40",
    },
    { label: "v3", authorId: minjun.id, note: "설문 결과 그래프 3개 추가", size: "7.9MB", kind: "pptx", whenLabel: "9/13 16:02" },
    { label: "v4", authorId: seoyeon.id, note: "표지·간지 레이아웃 교체", size: "8.4MB", kind: "pptx", whenLabel: "어제 21:14" },
  ];
  for (const [i, v] of deckVersions.entries()) {
    await prisma.fileVersion.create({
      data: { ...v, fileId: deckBox.files[0].id, createdAt: new Date(Date.now() - (deckVersions.length - i) * 60_000) },
    });
  }

  const researchVersions = [
    { label: "v1", note: "논문 5편 요약 정리", size: "1.1MB", whenLabel: "9/14 22:05", isLate: false },
    { label: "v2", note: "통계청 자료 표 추가", size: "1.4MB", whenLabel: "9/16 09:12", isLate: true },
  ];
  for (const [i, v] of researchVersions.entries()) {
    await prisma.fileVersion.create({
      data: {
        ...v,
        kind: "docx",
        fileId: researchBox.files[0].id,
        authorId: minjun.id,
        createdAt: new Date(Date.now() - (researchVersions.length - i) * 60_000),
      },
    });
  }

  /* ── 19 / 30 / 31 / 32 채팅 ────────────────────────────── */
  const teamMessages = [
    { authorId: seoyeon.id, text: "내일 회의 몇 시로 할까요? 저는 오후 다 됩니다", whenLabel: "14:02" },
    { authorId: jiho.id, text: "저는 3시 이후로 부탁드려요, 알바 있어서", whenLabel: "14:03" },
    { authorId: yuna.id, text: "네 저도 3시 이후 괜찮아요", whenLabel: "14:04" },
    {
      authorId: minjun.id,
      text: "혹시 자료 올리는 데 어려운 점이 있을까요? 내일이 마감이라 지금 상황만 알려주시면 제가 맞춰서 준비해 볼게요.",
      whenLabel: "14:05",
      viaCushion: true,
    },
  ];
  const createdTeamMessages = [];
  for (const [i, m] of teamMessages.entries()) {
    createdTeamMessages.push(
      await prisma.message.create({
        data: {
          ...m,
          teamId: team.id,
          threadKey: "team",
          createdAt: new Date(Date.now() - (teamMessages.length - i) * 60_000),
        },
      }),
    );
  }
  await prisma.messageReaction.createMany({
    data: [
      { messageId: createdTeamMessages[1].id, memberId: minjun.id, icon: "thumbs-up" },
      { messageId: createdTeamMessages[1].id, memberId: yuna.id, icon: "thumbs-up" },
      { messageId: createdTeamMessages[3].id, memberId: seoyeon.id, icon: "check" },
    ],
  });

  /** DM 스레드 키 — 두 사람의 id 를 정렬해 이어 붙인다(누가 먼저 열든 같은 방). */
  const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;

  const dms: Array<{ with: string; messages: Array<{ authorId: string; text: string; whenLabel: string }> }> = [
    {
      with: seoyeon.id,
      messages: [
        { authorId: seoyeon.id, text: "표지 시안 3개 중에 어떤 게 나아요?", whenLabel: "13:15" },
        { authorId: minjun.id, text: "노란 톤이 팀 캐릭터랑도 잘 어울려서 저는 그게 좋아요", whenLabel: "13:18" },
        { authorId: seoyeon.id, text: "표지 시안 오늘 밤까지 올릴게요!", whenLabel: "13:20" },
      ],
    },
    {
      with: jiho.id,
      messages: [
        { authorId: minjun.id, text: "목요일 회의 시간 3시로 확정해도 될까요?", whenLabel: "어제 20:40" },
        { authorId: jiho.id, text: "네, 확인했습니다", whenLabel: "어제 20:41" },
      ],
    },
    {
      with: yuna.id,
      messages: [
        {
          authorId: minjun.id,
          text: "대본 초안 기록에 박지호님이 의견을 남겼어요. 한번 봐주실 수 있을까요?",
          whenLabel: "9/14 22:01",
        },
        { authorId: yuna.id, text: "대본 초안 부분은 저도 같이 썼는데요", whenLabel: "9/14 22:05" },
        { authorId: yuna.id, text: "기여도 화면에서 정정 요청 넣어볼게요", whenLabel: "9/14 22:06" },
      ],
    },
  ];
  for (const dm of dms) {
    for (const [i, m] of dm.messages.entries()) {
      await prisma.message.create({
        data: {
          ...m,
          teamId: team.id,
          threadKey: dmKey(minjun.id, dm.with),
          createdAt: new Date(Date.now() - (dm.messages.length - i) * 60_000),
        },
      });
    }
  }
  // 박지호와의 대화는 이미 읽은 것으로 둔다 — 안 읽음이 전부 0 이면 배지를 확인할 수 없다.
  await prisma.readMark.create({
    data: { memberId: minjun.id, threadKey: dmKey(minjun.id, jiho.id) },
  });

  /* ── 16 / 17 / 18 / 23 기여도 ──────────────────────────── */
  // 한 줄씩 1분 간격으로 넣는다. `createMany` 로 한꺼번에 넣으면 `createdAt` 이 모두 같아져
  // `orderBy: createdAt` 이 갈리지 않고 목록 순서가 조회마다 달라진다.
  const contribRecords = [
      {
        memberId: minjun.id,
        kind: "task",
        title: "설문 문항 설계와 배포",
        detail: "합의한 역할: 자료조사",
        whenLabel: "9/8 – 9/12",
        source: "auto",
        state: "ok",
      },
      {
        memberId: minjun.id,
        kind: "file",
        title: "발표 자료 v3 — 그래프 3개 추가",
        detail: "드라이브 버전 기록",
        whenLabel: "9/13 16:02",
        source: "auto",
        state: "ok",
      },
      {
        memberId: minjun.id,
        kind: "meet",
        title: "팀 회의 3회 참여",
        detail: "9/5 · 9/9 · 9/13",
        whenLabel: "9월",
        source: "auto",
        state: "ok",
      },
      {
        memberId: minjun.id,
        kind: "due",
        title: "자료조사 마감 이행",
        detail: "약속 9/12 → 제출 9/12",
        whenLabel: "9/12",
        source: "auto",
        state: "ok",
      },
      {
        memberId: minjun.id,
        kind: "help",
        title: "이서연님 PPT 오류 수정 도움",
        detail: "오프라인 작업 — 내가 직접 추가",
        whenLabel: "9/14",
        source: "self",
        state: "pending",
      },
      {
        memberId: seoyeon.id,
        kind: "file",
        title: "PPT 템플릿 제작과 4회 수정",
        detail: "드라이브 버전 기록",
        whenLabel: "9/11 – 9/18",
        source: "auto",
        state: "ok",
      },
      {
        memberId: jiho.id,
        kind: "task",
        title: "회의 일정 조율과 마감 알림",
        detail: "합의한 역할: 일정 관리",
        whenLabel: "9월",
        source: "auto",
        state: "ok",
      },
      {
        memberId: yuna.id,
        kind: "file",
        title: "발표 대본 초안 작성",
        detail: "드라이브 버전 기록",
        whenLabel: "9/14",
        source: "auto",
        state: "disputed",
        dispute: "초안은 공동 작성이었고 분량 절반은 제가 썼습니다.",
        disputedById: jiho.id,
      },
  ];
  const everyone = [minjun, seoyeon, jiho, yuna];
  for (const [i, r] of contribRecords.entries()) {
    const record = await prisma.contribRecord.create({
      data: { ...r, createdAt: new Date(Date.now() - (contribRecords.length - i) * 60_000) },
    });
    // 확인 문구("3명 확인")는 저장하지 않고 확인 행에서 계산한다. `ok` 인 기록은
    // 본인을 뺀 팀원이 확인해 준 것이므로 그 행들을 함께 넣는다.
    if (r.state === "ok") {
      await prisma.contribConfirm.createMany({
        data: everyone
          .filter((m) => m.id !== r.memberId)
          .map((m) => ({ recordId: record.id, memberId: m.id })),
      });
    }
  }

  /* ── 21 할 일 ──────────────────────────────────────────── */
  // 기여 기록과 같은 이유로 한 줄씩 넣는다 — 순서가 흔들리면 안 된다.
  const tasks = [
      { title: "발표 자료 표지 시안 3개", kind: "team", assigneeId: seoyeon.id, due: "9/19", status: "doing", source: "clerk" },
      { title: "설문 응답 분석 표 정리", kind: "team", assigneeId: null, due: "9/20", status: "todo", source: "clerk" },
      { title: "발표 대본 초안", kind: "team", assigneeId: yuna.id, due: "9/22", status: "todo", source: "clerk" },
      { title: "자료조사 마감 확인", kind: "check", assigneeId: minjun.id, due: "9/18", status: "done", source: "manual" },
      { title: "발표 연습 개인 대본 외우기", kind: "study", assigneeId: minjun.id, due: "9/24", status: "todo", source: "manual" },
  ];
  for (const [i, t] of tasks.entries()) {
    await prisma.task.create({
      data: { ...t, teamId: team.id, createdAt: new Date(Date.now() - (tasks.length - i) * 60_000) },
    });
  }

  console.log(`데모 팀을 넣었습니다 — ${team.name} (초대 코드 ${team.code})`);
  if (isLocal) {
    console.log(`로컬 로그인: /join/rejoin 에서 초대 코드 ${team.code} · 이름(김민준 등) · 재입장 코드 ${DEMO_REJOIN_CODE}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
