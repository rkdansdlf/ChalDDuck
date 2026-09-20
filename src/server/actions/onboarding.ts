"use server";

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { issueRejoinCode } from "@/server/auth/issue";
import { db } from "@/server/db";
import { startSession } from "@/server/session";
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
    data: { name, course: input.course.trim(), code: await nextInviteCode() },
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
 * @returns 이 사람만 볼 수 있는 재입장 코드. 화면이 한 번만 보여 준다.
 */
export async function joinTeam(
  teamCode: string,
  draft: OnboardingDraft,
): Promise<{ rejoinCode: string; isLeader: boolean }> {
  const name = draft.name.trim();
  if (name.length < MIN_NAME) throw new Error("이름을 두 글자 이상 적어 주세요.");
  if (!draft.want) throw new Error("1순위 희망 역할을 골라 주세요.");

  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) throw new Error("초대 코드를 찾을 수 없습니다.");

  const taken = await db.member.findUnique({
    where: { teamId_name: { teamId: team.id, name } },
    select: { id: true },
  });
  if (taken) {
    throw new Error("이미 쓰이고 있는 이름입니다. 본인이라면 재입장으로 들어와 주세요.");
  }

  // 팀을 만든 브라우저가 첫 팀장이다. 쿠키가 없어졌으면(다른 기기로 들어옴) 팀에
  // 팀장이 아직 없을 때만 첫 사람에게 준다 — 나중에 들어온 사람이 가로채지 못한다.
  const store = await cookies();
  const createdHere = store.get(CREATOR_COOKIE)?.value === team.id;
  const hasLeader =
    (await db.member.count({ where: { teamId: team.id, isLeader: true, leftAt: null } })) > 0;
  const isLeader =
    !hasLeader &&
    (createdHere || (await db.member.count({ where: { teamId: team.id, leftAt: null } })) === 0);

  const member = await db.member.create({
    data: {
      teamId: team.id,
      name,
      isLeader,
      mbti: isMbtiType(draft.mbti) ? draft.mbti : null,
      mbtiFromQuiz: draft.mbtiFromQuiz,
      wantRole: draft.want,
      vetoRole: draft.veto,
    },
  });

  if (createdHere) store.delete(CREATOR_COOKIE);

  const rejoinCode = await issueRejoinCode(member.id);
  await startSession(member.id);

  // 여기서 redirect 하지 않는다 — 화면이 재입장 코드를 한 번 보여 준 뒤에 넘어간다.
  return { rejoinCode, isLeader };
}
