"use server";

import { randomInt, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isRoleKey, normalizeName } from "@/features/roles/roster-model";
import { issueRejoinCode } from "@/server/auth/issue";
import { db } from "@/server/db";
import { rebuildMeetingCandidates } from "@/server/meetings/candidates";
import { leaderIds, notify } from "@/server/notify/create";
import { forgetInviteToken, readInviteToken } from "@/server/invite/cookie";
import { createTeamInvite, findInviteByToken } from "@/server/invite/service";
import { takeClientAttempt, takePushSlot, takeTeamCreation } from "@/server/rate-limit/join-throttle";
import {
  describeDevice,
  getSessionMember,
  startSession,
  type SessionMember,
} from "@/server/session";
import { isMbtiType } from "@/lib/mbti";
import type { OnboardingDraft, Team } from "@/lib/types";

/**
 * 온보딩 서버 액션.
 *
 * 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수 있다. 그래서 **입력을 여기서 다시
 * 검사한다** — 화면에서 막았다는 사실은 보호가 되지 못한다.
 *
 * **검사에 실패하면 던지지 않고 돌려준다.** 운영 빌드의 Next 는 서버가 던진 오류의
 * 문구를 지우고 `digest` 만 보낸다. 던지면 호출한 화면에 아무 말이 남지 않아 "눌렀는데
 * 아무 일도 안 일어나는" 화면이 된다 — 실제로 그랬다.
 */

const MIN_NAME = 2;

/**
 * 이름 길이 상한.
 *
 * 화면에만 `maxLength` 가 있고 서버에는 없었다. 서버 액션은 화면을 거치지 않고 POST 로
 * 바로 불릴 수 있으므로, 그 공백으로 수천 글자짜리 이름이 저장될 수 있었다 — 그 이름이
 * 명단 한 줄, 말풍선, DM 머리말, 알림 제목에 그대로 들어가 화면을 밀어 버린다. 저장된
 * 이름을 **잘라서** 넣지 않는다: 조회 키(`@@unique([teamId, name])`)와 어긋나면 "같은 이름으로
 * 온 사람이 다른 사람"이 되어 재입장 문이 영영 풀리지 않는다.
 */
const MAX_NAME = 20;

/** `joinTeam` 이 거절한 이유. 화면이 무엇을 고쳐야 하는지 말해 준다. */
export type JoinBlock = "no-code" | "short-name" | "long-name" | "no-want" | "in-other-team";
/**
 * 이미 다른 팀에 속해 있는지.
 *
 * 예전에는 이 확인이 없었다. 팀 A의 팀원이 팀 B를 만들면 `startSession` 이 새 세션 쿠키만
 * 심고 **A 의 `Member` 행은 그대로 남는다** — `leftAt` 이 null 이라 A 의 명단·회의 후보·
 * 기여 리포트에 계속 세어지고, A 의 다른 기기 세션은 여전히 통한다. 되돌릴 길은 없다
 * (팀 전환 기능이 없고 팀 나가기는 팀 화면에서만 한다).
 *
 * 팀 전환을 **기능으로 넣을지는 기획에 없다.** 그래서 여기서는 조용히 팀을 바꾸지 못하게
 * 막는 데까지만 한다 — 새 팀을 만들거나 다른 팀에 들어가려면 먼저 팀에서 나가야 하고,
 * 그건 팀 화면에서 한 번이면 된다.
 */
async function findOtherTeam(): Promise<SessionMember | null> {
  return getSessionMember();
}

/**
 * 팀을 만든 브라우저를 기억하는 쿠키.
 *
 * "팀을 만든 사람이 팀장"인데, 팀을 만드는 시점에는 아직 팀원이 하나도 없다
 * (00 → 02~06 순서라 온보딩을 마쳐야 `Member` 가 생긴다). 그래서 만든 브라우저에
 * 표시를 남겼다가, 그 브라우저가 들어올 때 팀장으로 세운다.
 */
const CREATOR_COOKIE = "cd_creator";

/**
 * 팀을 만들 때 함께 생기는 제출함.
 *
 * **결과물을 내는 역할에만 칸이 있다.** 발표·일정 관리는 파일로 내는 것이 없어서 빼 둔다
 * (시드 데이터가 잡아 둔 구성과 같다). 마감은 팀이 정하는 값이라 비워 둔다.
 */
const SUBMISSION_BOXES = [
  { role: "research", name: "자료조사 제출함", due: "미정" },
  { role: "deck", name: "PPT 제출함", due: "미정" },
  { role: "script", name: "발표 대본 제출함", due: "미정" },
];

/** 승인을 기다리는 가입 요청을 들고 있는 쿠키. 세션 쿠키와 다르다 — 아직 아무 권한도 없다. */
const JOIN_COOKIE = "cd_join";

/** 가입 요청 쿠키의 조건. 요청을 새로 만들 때와, 이미 승인된 요청을 다시 심을 때 같다. */
const JOIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24,
} as const;

/** 같은 팀에 같은 이름의 기록이 이미 있는지. 02 화면이 "본인 확인" 시트를 띄울지 판단한다. */
export async function findMemberByName(
  teamCode: string,
  name: string,
): Promise<{ name: string } | null> {
  const wanted = normalizeName(name);
  // 상한을 넘은 이름은 저장될 수 없으므로 조회도 하지 않는다 — 조회가 다만 무의미한 일을
  // 반복하지 않도록 여기서 끊는다.
  if (wanted.length < MIN_NAME || wanted.length > MAX_NAME) return null;

  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) return null;

  // 이름으로 **사람을 집는** 조회가 아니라 "이 이름이 이미 쓰이는가" 를 묻는 조회다.
  // 같은 이름이 둘일 수 있게 되면 이 안내는 "한 명 이상 있다" 로 남고, 가입을 막는 자리는
  // 아래 `joinTeam` 의 게이트다(동명이인 작업 2단계에서 연다).
  const member = await db.member.findFirst({
    where: { teamId: team.id, name: wanted },
    select: { name: true },
  });
  return member;
}

/** 팀원 목록 미리보기를 위해 팀의 기존 팀원 중 한 명을 조회한다(없으면 null). */
export async function getTeamTeammatePreview(teamCode: string): Promise<string | null> {
  if (!teamCode) return null;
  const team = await db.team.findUnique({
    where: { code: teamCode.trim().toUpperCase() },
    select: { members: { where: { leftAt: null }, select: { name: true }, take: 1 } },
  });
  return team?.members[0]?.name ?? null;
}

/** 새 팀을 만들고 초대 코드를 발급한다. */
/** 팀 이름 길이 상한. 앱바·DM·알림 제목에 들어간다. */
const MAX_TEAM_NAME = 60;

/** 강의명 길이 상한. 팀 이름보다 짧게 — Chip 한 칸에 들어갈 만큼이면 충분하다. */
const MAX_COURSE = 40;

export async function createTeam(input: { name: string; course: string }): Promise<Team> {
  // 팀을 옮기는 기능이 없다. 조용히 옮기게 두면 예전 팀의 기록이 고아로 남는다.
  const other = await findOtherTeam();
  if (other) throw new Error("이미 팀에 속해 있습니다. 새 팀을 만들려면 먼저 팀에서 나가 주세요.");

  const name = input.name.trim();
  if (!name) throw new Error("팀 이름을 적어 주세요.");
  // 팀 이름은 앱바·DM·알림 제목에 들어간다. 화면에만 `maxLength` 가 있고 서버엔 없으면
  // 아무 한도가 없는 이름이 그대로 나간다.
  if (name.length > MAX_TEAM_NAME) throw new Error("팀 이름이 너무 깁니다. 60자 안으로 적어 주세요.");

  // 강의명도 **같은 이유로** 자른다. 예전에는 팀 이름만 막고 강의명은 두지 않았다. 그런데
  // 강의명은 `/join` 의 **인증 없는 공개 화면**에서 `Chip` 한 칸으로 그려지고 기여 리포트
  // 머리말에도 들어간다 — 수천 글자가 그대로 나가면 그 칸이 화면을 밀어 버린다.
  //
  // 잘라서 넣는다(거절하지 않는다): 강의명은 조회 키가 아니므로(팀의 유일 키는 `code`) 자르면서
  // 어긋날 일이 없다. 팀 이름이 거절인 것과 달리 여기서 사용자를 막을 이유가 없다.
  const course = input.course.trim().slice(0, MAX_COURSE);

  const team = await db.team.create({
    data: {
      name,
      course,
      code: await nextInviteCode(),
      // 제출함은 팀과 함께 생긴다. 없으면 드라이브가 빈 화면이고 만들 방법도 없었다.
      // 주인은 아직 없다 — 역할 추첨을 수락하면 그 사람이 주인이 된다.
      submissionBoxes: { create: SUBMISSION_BOXES },
    },
  });

  (await cookies()).set(CREATOR_COOKIE, team.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // 하루 — 만들고 바로 이어서 들어오는 흐름이다.
  });

  // **첫 초대 한 장을 함께 낸다.** 팀을 만들면 그것부터 공유할 수 있어야 "공유 한 번 = 초대
  // 한 장"이 지금부터 사실이 된다. 예전엔 팀 코드가 곧 공유였고, 그래서 되돌릴 방법이 없었다.
  //
  // `shortCode` 는 **비워 둔다.** 같은 값을 `Team.code` 에도 두면, 그 초대를 되돌려도
  // `Team.code` 길로 그대로 들어올 수 있어 폐기가 헛것이 된다. 직접 입력길을 초대로 옮기는
  // 것은 `Team.code` 를 없애는 마이그레이션과 함께 한다(`schema.prisma` TeamInvite 주석).
  const { token: inviteToken } = await createTeamInvite(team.id);

  return {
    id: team.id,
    name: team.name,
    course: team.course,
    code: team.code,
    /** 초대 링크 토큰의 **원문.** 여기서 한 번만 나오고, 서버에는 해시만 남는다. */
    inviteToken,
    memberCount: 0,
    dday: team.dday,
  };
}

/** 사람이 옮겨 적기 쉽도록 헷갈리는 글자(0/O, 1/I)를 뺀다. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 초대 코드 길이.
 *
 * 4자리는 32^4 ≈ 105만이라 스크립트로 전부 훑을 수 있었다 — `/join?code=` 는 인증 없는
 * 공개 화면이다. 6자리면 32^6 ≈ 10억이라 훑는 비용이 현실적이지 않다.
 */
const CODE_LENGTH = 6;

async function nextInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const body = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join("");
    const code = `CD-${body}`;
    if (!(await db.team.findUnique({ where: { code } }))) return code;
  }
  throw new Error("초대 코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

/**
 * 온보딩 입력으로 팀에 **처음** 들어간다.
 *
 * ⚠️ 예전에는 `upsert` 라, 이미 있는 이름을 적으면 그 사람의 기록을 이어받았다.
 * 초대 코드만 알면 팀원을 사칭할 수 있었고, 사칭한 쪽이 상대의 희망 역할·Veto 까지
 * 덮어썼다 — 역할 추첨의 입력이 바뀌는 일이다.
 *
 * 이제 **이미 있는 이름이면 거절한다.** 본인이 기기를 바꾼 것이라면
 * 재입장(`server/actions/rejoin.ts`)으로 가야 한다.
 *
 * 그리고 초대 코드를 아는 것만으로는 들어올 수 없다 — **팀장이 승인해야 팀원이 된다.**
 * 코드가 한 번 새면 누구든 팀 안을 볼 수 있기 때문이다. 팀장이 직접 초대했든 본인이
 * 요청했든 마지막 문은 팀장이 연다.
 *
 * 예외는 **팀을 만든 첫 사람**뿐이다. 승인해 줄 팀장이 아직 없다.
 */
export async function joinTeam(
  teamCode: string,
  draft: OnboardingDraft,
): Promise<
  | { status: "joined"; rejoinCode: string; isLeader: boolean }
  | { status: "requested" }
  | { status: "name-taken" }
  /**
   * **같은 이름으로 이미 처리 중인 요청이 있고, 이 브라우저가 그 소유자가 아니다.**
   *
   * 알아야 하는 게 없다 — 누구의 것인지, 누가 신청했는지, 승인됐는지. 말해 버리면 그 이름의
   * 사람이 팀에 있는지, 팀장이 누구인지, 자기 이름이 승인 대기 중인지까지 힌트가 된다. 화면은
   * 팀장에게 확인하라고 안내한다.
   */
  | { status: "taken" }
  /**
   * abuse 제한에 걸렸다. 이 브라우저 또는 이 팀이 너무 많이 신청했다.
   *
   * 멈추는 것은 **신청뿐**이다. 이 요청을 이미 만든 사람이 폴링하거나 회수하는 길, 팀장이
   * 승인·거절하는 길은 여기서 막히지 않는다 — 그렇지 않으면 공격 한 번이 정상 팀원의
   * 가입을 끝까지 막아 버린다.
   */
  | { status: "limited" }
  /**
   * 입력값이 서버의 규칙에 맞지 않는다.
   *
   * 예외 대신 돌려준다 — 운영 빌드는 서버가 던진 오류의 문구를 지우고 `digest` 만
   * 보낸다(위 `name-taken` 주석 참고). 던지면 06 화면의 유일한 버튼이 아무 일도 하지 않는
   * 화면이 된다. 무엇을 고쳐야 하는지 알 수 있어야 화면이 말할 수 있다.
   */
  | { status: "invalid"; reason: JoinBlock }
> {
  // 팀을 옮기는 기능이 없다 — 예전 팀의 기록을 고아로 남기지 않는다.
  if (await findOtherTeam()) return { status: "invalid", reason: "in-other-team" };

  const name = normalizeName(draft.name);
  if (name.length < MIN_NAME) return { status: "invalid", reason: "short-name" };
  if (name.length > MAX_NAME) return { status: "invalid", reason: "long-name" };
  if (!isRoleKey(draft.want)) return { status: "invalid", reason: "no-want" };

  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) return { status: "invalid", reason: "no-code" };

  // **이 게이트가 동명이인 작업 2단계에서 열린다.** 지금은 같은 이름이 한 팀에 둘일 수
  // 없으므로(스키마의 `@@unique([teamId, name])`) 존재만 확인해 재입장으로 안내한다 —
  // 이름이 둘이 될 수 있게 되면 여기서 "새 사람으로 / 기존 사람으로" 를 고르게 해야 한다.
  const taken = await db.member.findFirst({
    where: { teamId: team.id, name },
    select: { id: true },
  });
  // 던지지 않고 돌려준다 — 이건 사고가 아니라 **예상되는 결말**이고, 화면은 여기서
  // 재입장으로 안내해야 한다. 던지면 배포본에서 메시지가 가려져(Server Action 은 오류를
  // 숨긴다) 버튼을 눌러도 아무 일도 일어나지 않는 화면이 된다(실제로 그랬다).
  if (taken) return { status: "name-taken" };

  const values = {
    // **이메일을 요구하지 않는다** — 비어 있으면 그냥 없다. 강제하지 않는다: 강제하면
    // 팀 들어가기가 "양식을 채우는 일"이 되어 이 앱의 약속(초대 코드 + 이름)에 어긋난다.
    // 02 이름 화면에서 **선택**으로 받으며, 나중에 `계정과 기기` 에서도 바꿀 수 있다.
    email: draft.email ? draft.email.trim().toLowerCase() : null,
    mbti: isMbtiType(draft.mbti) ? draft.mbti : null,
    mbtiFromQuiz: draft.mbtiFromQuiz,
    wantRole: isRoleKey(draft.want) ? draft.want : null,
    // 같은 역할을 희망하면서 동시에 피할 수는 없다 — 화면에서 잠근다. 그래도 서버도
    // 본다: 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수 있다.
    vetoRole: isRoleKey(draft.veto) && draft.veto !== draft.want ? draft.veto : null,
  };

  // 팀을 만든 브라우저가 첫 팀장이다. 쿠키가 없어졌으면(다른 기기로 들어옴) 팀에
  // 아무도 없을 때만 첫 사람에게 준다 — 나중에 들어온 사람이 가로채지 못한다.
  const store = await cookies();
  const createdHere = store.get(CREATOR_COOKIE)?.value === team.id;

  // **판정과 삽입을 한 트랜잭션에서 한다, 팀 행을 잠근 안에서.**
  //
  // 예전에는 "팀장이 있나"와 "아무도 없나"를 읽고, 그 **뒤에** 별도 트랜잭션에서
  // `isLeader: true` 로 만들었다. 그 사이가 구멍이었다 — 빈 팀에 두 브라우저가 동시에 붙으면
  // 둘 다 "아무도 없다"를 보고 둘 다 팀장이 된다. 스키마에 `Member(teamId) WHERE isLeader` 의
  // 부분 유니크 인덱스가 없어 DB 도 막지 못한다(운영 DB 에 이미 있는 데이터를 이유로
  // 마이그레이션이 실패하지 않게 했다 — `drive.ts` 의 `withBoxLock` 주석과 같은 판단).
  //
  // ⚠️ **잠금이 실제로 그 일을 한다** — 2026-09-28 에 측정했다. 같은 두 문장을 잠금 없이 겹쳐
  // 돌리면 **25회 중 25회 팀장이 둘** 나왔다(`test:join` 의 "잠장이 없으면 팀장이 둘이 된다").
  //
  // ⚠️ 그런데 **`joinTeam` 을 통해서는 이 경합이 재현되지 않는다.** 잠금을 실제로 빼고 돌려도
  // 통과한다. 이유는 **가입 abuse 한계**다 — 팀을 행 키로 쓰고 `hitWindow` 의
  // `INSERT … ON CONFLICT DO UPDATE` 가 **행 단위로 직렬화**하므로, 요청들이 팀 잠금에 닿기
  // **전에** 차례로 처리된다(`server/rate-limit/join-throttle.ts`).
  //
  // 즉 지금 이 잠금은 **방어선**이고, 실제로 경합을 막는 직렬화는 **의도하지 않은 부작용**이다.
  // 한계의 키나 숫자를 손대는 사람이 팀장 선출의 안전까지 함께 흔들게 된다 — 그래서 이 잠금을
  // 지우지 않는다. 이 사실을 모르면 "한계가 느슨해졌는데 팀장은 여전히 하나다" 고 착각한다.
  // 팀 행을 잠그면 두 번째 트랜잭션은 첫 번째가 끝난 뒤에 읽으므로 `hasLeader` 가 참이 되고
  // 승인 요청 길로 넘어간다. 되돌릴 수 없는 "팀장이 둘" 상태를 만들지 않게 하는 최단 경로다.
  //
  // 승인을 기다려야 하는 쪽(요청 길)은 잠금을 잡을 필요가 없다 — 팀장을 세는 판정이 이미
  // 끝났으니, 그대로 나간다.
  const entry = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Team" WHERE "id" = ${team.id} FOR UPDATE`;

    const hasLeader =
      (await tx.member.count({ where: { teamId: team.id, isLeader: true, leftAt: null } })) > 0;
    const isFirst = (await tx.member.count({ where: { teamId: team.id, leftAt: null } })) === 0;

    if (hasLeader || !(createdHere || isFirst)) return { path: "request" as const };

    // 멤버를 만드는 것과 재입장 코드를 붙이는 것을 한 트랜잭션으로 묶는다 — 둘 중 하나만
    // 성공하면 이름은 있는데 재입장 코드가 없는 사람이 생기고, 팀장이 자신뿐이면 그
    // 상태에서 영영 못 돌아온다(실제로 한 번 있었다).
    const member = await tx.member.create({
      data: { teamId: team.id, name, isLeader: true, ...values },
    });
    const rejoinCode = await issueRejoinCode(member.id, tx);
    return { path: "join" as const, member, rejoinCode };
  });

  if (entry.path === "join") {
    if (createdHere) store.delete(CREATOR_COOKIE);

    await startSession(entry.member.id);

    // 여기서 redirect 하지 않는다 — 화면이 재입장 코드를 한 번 보여 준 뒤에 넘어간다.
    return { status: "joined", rejoinCode: entry.rejoinCode, isLeader: true };
  }

  // ── 여기부터는 승인 요청 길이다 ────────────────────────────────────────────
  //
  // 1) 이 브라우저의 빠른 반복  2) 기존 요청의 소유권  3) 팀 예산과 새 요청 생성
  // 4) 알림. **이 순서가 규칙이고, 순서가 곧 방어다.**
  //
  // - 2번을 1번보다 먼저 두면 정상 사용자가 자기 요청을 고칠 때마다 제한에 걸린다.
  // - 3번을 2번보다 먼저 두면 팀 예산을 **자기 요청을 여는 데** 깎는다. 공개된 팀
  //   코드를 아는 사람이 그 숫자만 먹이면 팀 전체의 신규 가입이 막히는 DoS 가 된다.
  {
    // **1) 이 브라우저의 빠른 반복.** 이름만 바꿔 가며 찍어도 매번 알림이 나가므로 여기가
    // 진짜 문이다(`rate-limit/join-throttle.ts`). 행도 알림도 **만들기 전에** 막는다.
    if ((await takeClientAttempt()) !== "open") return { status: "limited" };

    // 예전에는 `upsert` 의 create/update 두 갈래에서 각각 `await describeDevice()` 를 불러
    // 기기 설명을 두 번 읽었다. 한 번만 읽는다 — 값이 같으므로 결과도 같다.
    const label = await describeDevice();

    // **이 요청이 어느 공유로 왔는지.**
    //
    // `/join?t=` 로 들어온 브라우저에만 심겨 있다(`invite/cookie.ts`). **찾아서 기록할 뿐,
    // 막는 데 쓰지 않는다** — 초대가 있어도 팀장 승인은 그대로 받고, 없어도 `Team.code` 로
    // 똑같이 신청된다. 초대는 출처를 정해 줄 뿐 자격이 아니다.
    //
    // 유효성은 **지금 다시 확인한다.** 링크를 열 때 유효했더라도 그 뒤에 폐기되었거나
    // 만료됐다면 여기서 빠진다 — 그 사이에 들어온 요청에 출처를 붙이면 안 된다.
    const invitedBy = await readInviteToken();
    const rawInvite = invitedBy ? await findInviteByToken(invitedBy) : null;
    // 불변식: 가입하려는 팀과 초대 토큰의 팀이 일치할 때만 출처로 인정한다.
    // 이전 팀의 초대 쿠키가 남아 있는 상태에서 다른 팀으로 가입할 때 타 팀 초대로 오염되는 것을 막는다.
    const invite = rawInvite && rawInvite.teamId === team.id ? rawInvite : null;
    if (rawInvite && rawInvite.teamId !== team.id) {
      await forgetInviteToken();
    }

    // **2) 기존 요청이 있으면, 이 브라우저가 그 소유자인지가 전부다.**
    //
    // 여기서부터가 이 액션의 보안 불변식이다:
    //
    // > **`JoinRequest` 의 `token` 은 만들어진 뒤로 바뀌지 않는다.**
    //
    // 예전에는 `upsert` 의 `update: { token }` 가 이걸 무조건 돌려서 **아직 승인도 안 된
    // pending 요청**을 다른 브라우저가 가로챌 수 있었다:
    //   1) B1 이 "김민준" 으로 신청 → token=T1, B1 의 쿠키=T1, pending
    //   2) (코드, 이름) 을 아는 사람이 같은 이름으로 다시 신청 → `update` 가 token=T2,
    //      그리고 **자기** 쿠키에 T2 를 심는다
    //   3) B1 이 폴링 → T1 이 없어 `{status:"none"}` → `/join` 으로 튕겨난다
    //   4) 팀장이 승인 → `Member` 와 재입장 코드가 **가로챈 사람**에게 만들어진다
    //
    // 위 주석이 설명하던 "승인된 요청을 넘겨붙이기" 의 같은 버그가, `approved` 뿐 아니라
    // **`pending` 에도** 열려 있었다. 두 상태를 나누지 않는다 — 토큰은 **회수되기 전까지**
    // 불변이다(`pending` 과 `approved-but-not-claimed` 둘 다).
    //
    // 그래서 소유자 판정은 **DB 에 있는 토큰과 내 쿠키가 같은지로만** 한다. 상태는 보지
    // 않는다 — 토큰을 가진 쪽이 그 요청의 주인이고, 주인이면 `pending` 이든 `approved` 든
    // 자기 것이다.
    const mine = store.get(JOIN_COOKIE)?.value;
    /**
     * **내 토큰으로 먼저 찾는다.** 이름으로 찾으면 같은 이름이 둘일 때 남의 요청을 내 것으로
     * 착각할 수 있다 — 소유자 판정이 "내 쿠키의 토큰과 같은 행" 이라는 불변식은 이쪽이 더
     * 정확하다(토큰은 사람마다 다르다). `token` 은 유일하므로 `findUnique` 가 그대로 된다.
     */
    const byToken = mine
      ? await db.joinRequest.findUnique({
          where: { token: mine },
          select: { id: true, token: true, status: true, teamId: true },
        })
      : null;
    const activeTokenRequest = byToken && byToken.teamId === team.id ? byToken : null;
    /**
     * 토큰이 없거나(첫 신청) 그 토큰의 행이 없으면, **이 이름으로 처리 중인 요청이 있는지**를
     * 본다. 있으면 남의 것이므로 건드리지 않고 `taken` 이다.
     *
     * ⚠️ **동명이인 작업 2단계에서 여기가 바뀐다.** 이름이 둘이면 "이 이름의 요청" 이 남의
     * 것인지 내 것인지 이름만으로는 못 가른다. 지금은 이름이 유일해서 이 판정이 맞다.
     */
    const found =
      activeTokenRequest ??
      (await db.joinRequest.findFirst({
        where: { teamId: team.id, name },
        select: { id: true, token: true, status: true },
      }));

    // 거절된 요청은 이미 끝난 것이다. **토큰이 죽었으니**(`checkJoinApproval` 이 거절을
    // 보고 쿠키를 지운다) 행만 치우고 새 요청을 받게 한다 — 안 치우면 거절을 받은 사람이
    // 다시 신청해도 늘 같은 벽에 부딪혀 통과할 수가 없다.
    if (found?.status === "rejected") {
      await db.joinRequest.delete({ where: { id: found.id } });
    } else if (found) {
      if (mine !== found.token) {
        // **남의 요청은 손대지 않는다.** 토큰도, 고른 값(희망 역할·Veto)도, 상태도.
        // 희망 역할을 덮어쓰는 건 역할 추첨의 입력을 바꾸는 일이고(위 `name-taken` 주석의
        // 사칭과 같은 계열), 무엇을 아는지도 말하지 않는다.
        return { status: "taken" };
      }

      // **소유자.** 승인 여부와 무관하게 자기 요청이므로 고친 값만 반영하고, 토큰은 그대로
      // 둔다. 알림은 다시 울리지 않는다 — 같은 요청에 대한 알림이 쌓이면 그것도 폭탄이다.
      await db.joinRequest.update({
        where: { id: found.id },
        // `inviteId` 는 **고치지 않는다.** 처음 신청할 때 온 공유가 그 요청의 출처이고,
        // 나중에 링크를 바꿔 붙여도 그건 "처음에 이 공유로 왔다"의 증거가 바뀌지 않는다.
        data: { ...values, label },
      });
      store.set(JOIN_COOKIE, found.token, JOIN_COOKIE_OPTIONS);
      revalidatePath("/team", "layout");
      revalidatePath("/home");
      return { status: "requested" };
    }

    // **3) 새 요청.** `upsert` 대신 `create` 다. **`token` 을 갱신하는 코드가 이 함수에
    // 존재하지 않아야** 위 불변식이 성립한다 — 그래서 동시 요청은 DB 가 이긴다.
    //
    // 두 브라우저가 같은 이름을 동시에 신청하면 둘 중 하나만 `create` 에 성공하고, 진 사람은
    // `P2002` 를 받는다. **그때 절대 덮어쓰지 않는다** — 자기가 만든 것처럼 보이는 요청을
    // 지워야 진짜 신청자가 풀릴 수 있다. 누가 이겼는지는 중요하지 않다(테스트가 박는다).
    // **3) 팀 예산.** 여기까지 왔다는 것은 "이 이름으로는 아직 처리 중인 요청이 없다" 는 뜻이다
    // — 즉 **실제로 새 행을 만들려는 시점**이다. 그래서 팀 예산을 여기서, 그리고 여기서만
    // 깎는다. 앞의 소유자 확인을 통과한 재요청이 예산을 먹는 일이 없어야 한다.
    if ((await takeTeamCreation(team.id)) !== "open") return { status: "limited" };

    const token = randomUUID();
    try {
      await db.joinRequest.create({
        data: { teamId: team.id, inviteId: invite?.id ?? null, name, ...values, token, label },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return { status: "taken" };
      throw error;
    }

    store.set(JOIN_COOKIE, token, JOIN_COOKIE_OPTIONS);

    // **4) 알림.** 앱 안 알림은 반드시 남기고, **푸시만** 예산 안에서 보낸다. 예산이 모자라면
    // 요청과 알림함 기록은 그대로 두고 기기 밖 울림만 멈춘다 — 방어를 위해 "누가 들어오려 했는지"
    // 를 기록에서 지우지는 않는다.
    await notify({
      to: await leaderIds(team.id),
      kind: "join-request",
      title: `${name}님이 팀에 들어오려 합니다`,
      body: "본인이 맞는지 확인하고 승인해 주세요",
      href: "/team/access",
      push: await takePushSlot(team.id),
    });

    revalidatePath("/team", "layout");
    revalidatePath("/home");
    return { status: "requested" };
  }
}

/**
 * 요청한 브라우저가 승인됐는지 스스로 확인한다.
 *
 * 승인되는 순간이 아니라 여기서 팀원이 된다 — 세션 쿠키를 심을 수 있는 것은 **요청한
 * 브라우저 자신**뿐이라, 팀장의 브라우저에서 만들 수 없다.
 */
export async function checkJoinApproval(): Promise<
  { status: "approved"; rejoinCode: string } | { status: "pending" | "rejected" | "none" } | { status: "name-taken" }
> {
  const store = await cookies();
  const token = store.get(JOIN_COOKIE)?.value;
  if (!token) return { status: "none" };

  const request = await db.joinRequest.findUnique({ where: { token } });
  if (!request) return { status: "none" };
  // **`claimed` 도 기다리는 상태다.** 다른 폴링이 이미 가져가서 팀원을 만드는 중이라는
  // 뜻이다. 여기서 "승인 아님"으로 읽으면 쿠키를 지워 **진행 중인 입장을 스스로 끊는다.**
  if (request.status === "pending" || request.status === "claimed") return { status: "pending" };
  if (request.status !== "approved") {
    store.delete(JOIN_COOKIE);
    return { status: "rejected" };
  }

  // 멤버를 만드는 것과 재입장 코드를 붙이는 것을 한 트랜잭션으로 묶는다 — joinTeam 과
  // 같은 이유다.
  let memberId: string;
  let rejoinCode: string;
  try {
    const claimed = await db.$transaction(async (tx) => {
      /**
       * **이 요청을 내가 가져갔는지 먼저 본다.**
       *
       * 예전에는 `@@unique([teamId, name])` 이 이 자리를 대신 지켰다 — 겹친 폴링이 같은
       * 이름으로 `member.create` 를 두 번 하면 P2002 가 났고, 아래 catch 가 그걸 읽었다.
       * **동명이인을 허용하면 그 제약이 사라져** 같은 요청이 두 번 처리되고 팀원이 둘 생긴다.
       *
       * 조건부 갱신이라 겹친 트랜잭션 중 **하나만** 1행을 받는다(진 쪽은 행 잠금을 기다렸다가
       * 조건이 더는 맞지 않아 0행). 선점과 생성을 한 트랜잭션에 두었으므로 도중에 실패하면
       * 선점도 함께 되돌아간다 — "선점만 되고 팀원은 안 생긴" 상태가 남지 않는다.
       */
      const won = await tx.joinRequest.updateMany({
        where: { id: request.id, status: "approved" },
        data: { status: "claimed" },
      });
      if (won.count === 0) return null;

      const member = await tx.member.create({
        data: {
          teamId: request.teamId,
          name: request.name,
          // 요청자가 적은 값만 옮긴다. 빈 문자열을 "없다"로 보아 빈 값이 명단을 오염시키게
          // 두지 않는다.
          email: request.email || null,
          mbti: request.mbti,
          mbtiFromQuiz: request.mbtiFromQuiz,
          wantRole: request.wantRole,
          vetoRole: request.vetoRole,
        },
      });
      const code = await issueRejoinCode(member.id, tx);
      return { member, rejoinCode: code };
    });

    if (!claimed) {
      // 다른 폴링이 가져갔다. 그쪽이 팀원을 만들고 세션을 시작한다 — 나는 기다리거나,
      // 이미 세션이 서 있으면 물러난다.
      const mine = await db.session.findUnique({ where: { token }, select: { memberId: true } });
      return mine ? { status: "none" } : { status: "pending" };
    }
    ({ member: { id: memberId }, rejoinCode } = claimed);
  } catch (error) {
    /**
     * P2002 는 **두 가지** 이유로 온다. 예전에는 "폴링이 겹쳤다" 고만 읽고 두 번째를
     * 요청 삭제로 처리했는데, 그랬더니 **같은 이름의 다른 사람**이 승인된 경우까지
     * 조용히 사라졌다(2026-09-28 확인). 신청인은 아무 설명 없이 처음부터, 팀장 목록에는
     * 이미 없는 요청으로 남았다.
     *
     * 구분은 **세션이 이미 있는지**로 한다. 겹친 폴링에서 이긴 쪽이 `startSession(memberId,
     * token)` 으로 **요청 토큰을 그대로 세션 토큰으로** 쓰므로, 이길 쪽이 처리했다면 그 토큰의
     * 세션이 있다. 없으면 그 이름을 가진 사람은 **다른 사람**이고, 여기서 지우면 안 된다.
     *
     * 그래도 막는 곳을 앞세웠다면 이 도달하지 않는다 — 승인이 이름 충돌을 먼저 확인한다
     * (`server/invite/settle.ts` 의 `"name-taken"`). 여기는 안전망이다.
     *
     * ⚠️ **동명이인 작업 5단계에서 이 catch 가 하는 일이 줄어든다.** 위에서 `approved` 를
     * 조건부로 선점하므로 겹친 폴링은 여기 오지 않고, 이름 유니크가 사라지면 P2002 자체가
     * 나지 않는다 — 남는 것은 "다른 사람이 같은 이름을 쓰는 중" 뿐이다.
     */
    if ((error as { code?: string }).code === "P2002") {
      const alreadyOurs = await db.session.findUnique({ where: { token }, select: { memberId: true } });
      if (alreadyOurs) {
        // 이길 쪽이 이미 팀원으로 만들었다. 요청만 정리한다.
        await db.joinRequest.delete({ where: { token } });
        store.delete(JOIN_COOKIE);
        return { status: "none" };
      }
      // 다른 사람이 그 이름을 쓰고 있다. **요청을 지우지 않는다** — 신청인이 이름을 고쳐
      // 다시 보낼 수 있어야 하고, 팀장에게도 아직 해결되지 않은 요청으로 보여야 한다.
      return { status: "name-taken" };
    }
    throw error;
  }

  // 인원이 늘면 "몇 명 가능"이 달라진다.
  await rebuildMeetingCandidates(request.teamId);

  await db.joinRequest.delete({ where: { token } });

  // **쿠키는 멤버가 만들어진 다음에 지운다.** 예전에는 지터를 먼저 해서, 세션 시작이
  // 꼬이면 토큰을 잃어버렸다. 그러면 요청은 `approved` 인데 아무도 다시 꺼낼 수 없고
  // ("승인 대기" 목록에도 없으니) 팀장이 두 번 승인해도 돌아올 수 없는 사람이 된다.
  store.delete(JOIN_COOKIE);
  await startSession(memberId, token);
  return { status: "approved", rejoinCode };
}

/**
 * 내 MBTI 변경.
 * 온보딩 이후에도 팀 화면이나 프로필에서 언제든 수정할 수 있다.
 */
export async function updateMyMbti(newMbti: string | null): Promise<"ok" | "invalid"> {
  const session = await getSessionMember();
  if (!session) return "invalid";

  const validMbti = isMbtiType(newMbti) ? newMbti : null;

  await db.member.update({
    where: { id: session.id },
    data: {
      mbti: validMbti,
      mbtiFromQuiz: false, // 직접 수정했으므로 quiz 플래그 해제
    },
  });

  revalidatePath("/team");
  revalidatePath("/home");
  revalidatePath("/chat/team");
  return "ok";
}
