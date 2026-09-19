"use server";

import { redirect } from "next/navigation";
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

async function nextInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const body = Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
    const code = `CD-${body}`;
    if (!(await db.team.findUnique({ where: { code } }))) return code;
  }
  throw new Error("초대 코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

/**
 * 온보딩 입력으로 팀에 들어간다.
 *
 * 같은 이름이 이미 있으면 그 기록을 이어받는다 — 기기를 바꿔도 이전 기록에 연결되어야 한다.
 *
 * ⚠️ 이름만으로 같은 사람이라고 보는 것은 **아직 확정되지 않은 정책**이고, 같은 팀 안에서
 * 서로를 사칭할 수 있는 구멍이기도 하다(`server/session.ts` 참고).
 */
export async function joinTeam(teamCode: string, draft: OnboardingDraft): Promise<void> {
  const name = draft.name.trim();
  if (name.length < MIN_NAME) throw new Error("이름을 두 글자 이상 적어 주세요.");
  if (!draft.want) throw new Error("1순위 희망 역할을 골라 주세요.");

  const team = await db.team.findUnique({ where: { code: teamCode.trim().toUpperCase() } });
  if (!team) throw new Error("초대 코드를 찾을 수 없습니다.");

  const values = {
    mbti: isMbtiType(draft.mbti) ? draft.mbti : null,
    mbtiFromQuiz: draft.mbtiFromQuiz,
    wantRole: draft.want,
    vetoRole: draft.veto,
  };

  const member = await db.member.upsert({
    where: { teamId_name: { teamId: team.id, name } },
    update: values,
    create: { teamId: team.id, name, ...values },
  });

  await startSession(member.id);
  redirect("/team");
}
