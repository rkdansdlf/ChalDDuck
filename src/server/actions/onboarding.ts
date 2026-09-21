"use server";

import { randomInt, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { issueRejoinCode } from "@/server/auth/issue";
import { db } from "@/server/db";
import { rebuildMeetingCandidates } from "@/server/meetings/candidates";
import { leaderIds, notify } from "@/server/notify/create";
import { describeDevice, startSession } from "@/server/session";
import { isMbtiType } from "@/lib/mbti";
import type { OnboardingDraft, Team } from "@/lib/types";

/**
 * 온보딩 서버 액션.
 *
 * 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수 있다. 그래서 **입력을 여기서 다시
 * 검사한다** — 화면에서 막았다는 사실은 보호가 되지 못한다.
 */

const MIN_NAME = 2;

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

/** 같은 팀에 같은 이름의 기록이 이미 있는지. 02 화면이 "본인 확인" 시트를 띄울지 판단한다. */
export async function findMemberByName(
  teamCode: string,
  name: string,
): Promise<{ name: string } | null> {
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME) return null;

  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) return null;

  const member = await db.member.findUnique({
    where: { teamId_name: { teamId: team.id, name: trimmed } },
    select: { name: true },
  });
  return member;
}

/** 새 팀을 만들고 초대 코드를 발급한다. */
export async function createTeam(input: { name: string; course: string }): Promise<Team> {
  const name = input.name.trim();
  if (!name) throw new Error("팀 이름을 적어 주세요.");

  const team = await db.team.create({
    data: {
      name,
      course: input.course.trim(),
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

  return {
    id: team.id,
    name: team.name,
    course: team.course,
    code: team.code,
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
> {
  const name = draft.name.trim();
  if (name.length < MIN_NAME) throw new Error("이름을 두 글자 이상 적어 주세요.");
  if (!draft.want) throw new Error("1순위 희망 역할을 골라 주세요.");

  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) throw new Error("초대 코드를 찾을 수 없습니다.");

  const taken = await db.member.findUnique({
    where: { teamId_name: { teamId: team.id, name } },
    select: { id: true },
  });
  // 던지지 않고 돌려준다 — 이건 사고가 아니라 **예상되는 결말**이고, 화면은 여기서
  // 재입장으로 안내해야 한다. 던지면 배포본에서 메시지가 가려져(Server Action 은 오류를
  // 숨긴다) 버튼을 눌러도 아무 일도 일어나지 않는 화면이 된다(실제로 그랬다).
  if (taken) return { status: "name-taken" };

  const values = {
    mbti: isMbtiType(draft.mbti) ? draft.mbti : null,
    mbtiFromQuiz: draft.mbtiFromQuiz,
    wantRole: draft.want,
    vetoRole: draft.veto,
  };

  // 팀을 만든 브라우저가 첫 팀장이다. 쿠키가 없어졌으면(다른 기기로 들어옴) 팀에
  // 아무도 없을 때만 첫 사람에게 준다 — 나중에 들어온 사람이 가로채지 못한다.
  const store = await cookies();
  const createdHere = store.get(CREATOR_COOKIE)?.value === team.id;
  const hasLeader =
    (await db.member.count({ where: { teamId: team.id, isLeader: true, leftAt: null } })) > 0;
  const isFirst = (await db.member.count({ where: { teamId: team.id, leftAt: null } })) === 0;

  if (hasLeader || !(createdHere || isFirst)) {
    // 팀장이 있으면 초대 코드만으로는 들어오지 못한다. 요청만 남기고 승인을 기다린다.
    const token = randomUUID();
    await db.joinRequest.upsert({
      where: { teamId_name: { teamId: team.id, name } },
      update: {
        ...values,
        token,
        status: "pending",
        label: await describeDevice(),
        resolvedAt: null,
      },
      create: { teamId: team.id, name, ...values, token, label: await describeDevice() },
    });

    store.set(JOIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    await notify({
      to: await leaderIds(team.id),
      kind: "join-request",
      title: `${name}님이 팀에 들어오려 합니다`,
      body: "본인이 맞는지 확인하고 승인해 주세요",
      href: "/team/access",
    });

    revalidatePath("/team", "layout");
    revalidatePath("/home");
    return { status: "requested" };
  }

  const member = await db.member.create({
    data: { teamId: team.id, name, isLeader: true, ...values },
  });

  if (createdHere) store.delete(CREATOR_COOKIE);

  const rejoinCode = await issueRejoinCode(member.id);
  await startSession(member.id);

  // 여기서 redirect 하지 않는다 — 화면이 재입장 코드를 한 번 보여 준 뒤에 넘어간다.
  return { status: "joined", rejoinCode, isLeader: true };
}

/**
 * 요청한 브라우저가 승인됐는지 스스로 확인한다.
 *
 * 승인되는 순간이 아니라 여기서 팀원이 된다 — 세션 쿠키를 심을 수 있는 것은 **요청한
 * 브라우저 자신**뿐이라, 팀장의 브라우저에서 만들 수 없다.
 */
export async function checkJoinApproval(): Promise<
  { status: "approved"; rejoinCode: string } | { status: "pending" | "rejected" | "none" }
> {
  const store = await cookies();
  const token = store.get(JOIN_COOKIE)?.value;
  if (!token) return { status: "none" };

  const request = await db.joinRequest.findUnique({ where: { token } });
  if (!request) return { status: "none" };
  if (request.status === "pending") return { status: "pending" };

  store.delete(JOIN_COOKIE);
  if (request.status !== "approved") return { status: "rejected" };

  const member = await db.member.create({
    data: {
      teamId: request.teamId,
      name: request.name,
      mbti: request.mbti,
      mbtiFromQuiz: request.mbtiFromQuiz,
      wantRole: request.wantRole,
      vetoRole: request.vetoRole,
    },
  });

  // 인원이 늘면 "몇 명 가능"이 달라진다.
  await rebuildMeetingCandidates(request.teamId);

  await db.joinRequest.delete({ where: { token } });

  const rejoinCode = await issueRejoinCode(member.id);
  await startSession(member.id, token);
  return { status: "approved", rejoinCode };
}
