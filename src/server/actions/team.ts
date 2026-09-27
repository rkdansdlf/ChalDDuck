"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { rebuildMeetingCandidates } from "@/server/meetings/candidates";
import { clearRemembered, endSession, getSessionMember, requireLeader, requireSessionMember, setRememberCookie, type SessionMember } from "@/server/session";

/**
 * 팀에서 나가기 · 팀장 넘기기 · 프로젝트 폭파.
 *
 * 팀장은 그냥 나갈 수 없다. 팀장이 사라지면 새 기기 재입장을 승인해 줄 사람이 없어
 * 팀원들이 기기를 바꾸는 순간 잠긴다. 그래서 나갈 때 **둘 중 하나를 골라야 한다** —
 * 팀원 한 명에게 넘기거나, 프로젝트를 통째로 없애거나.
 *
 * 나간 사람의 `Member` 행은 지우지 않고 `leftAt` 만 찍는다. 기여 기록·메시지·파일
 * 이력이 성적 근거라, 사람이 나갔다고 팀 기록에 구멍이 나면 안 된다.
 *
 * **추방은 두지 않는다.** 팀에 있는 사람은 어차피 초대 코드를 받아 들어온 사람이고,
 * 잘못 들어온 경우는 팀장이 재입장을 승인하지 않는 것으로 이미 막힌다. 나갔다가
 * 마음이 바뀌면 같은 이름으로 돌아올 수 있는 쪽이 팀플에 맞다.
 */

/**
 * 팀장에게 넘길 팀원을 찾아 검증한다.
 *
 * `transferLeadership` 와 `handOverAndLeave` 가 **같은 판단**을 해야 한다 — 한쪽만 조건이
 * 달라지면 넘기기만 되는 경로에서만 규칙이 샌다. 그래서 한 곳에 둔다.
 */
async function nextLeaderOrThrow(leader: SessionMember, toMemberId: string) {
  const next = await db.member.findFirst({
    where: { id: toMemberId, teamId: leader.teamId, leftAt: null },
  });
  if (!next) throw new Error("팀에 없는 사람에게는 넘길 수 없습니다.");
  if (next.id === leader.id) throw new Error("이미 팀장입니다.");
  return next;
}

/** 팀장을 팀원 한 명에게 넘긴다. 넘긴 사람은 팀에 남는다. */
export async function transferLeadership(toMemberId: string): Promise<void> {
  const leader = await requireLeader();
  const next = await nextLeaderOrThrow(leader, toMemberId);

  // 한 번에 옮긴다 — 중간에 끊기면 팀장이 둘이거나 없는 상태가 남는다.
  await db.$transaction([
    db.member.update({ where: { id: leader.id }, data: { isLeader: false } }),
    db.member.update({ where: { id: next.id }, data: { isLeader: true } }),
  ]);

  revalidatePath("/team", "layout");
  revalidatePath("/home");
}

/**
 * 팀에서 나간다.
 *
 * 팀장은 이 길로 나갈 수 없다 — 먼저 넘기거나(`transferLeadership`) 폭파해야 한다.
 * 그래서 화면도 팀장에게는 이 버튼을 그냥 보여 주지 않는다.
 */
export async function leaveTeam(): Promise<void> {
  const me = await requireSessionMember();
  if (me.isLeader) {
    throw new Error("팀장은 먼저 팀장을 넘기거나 프로젝트를 없애야 나갈 수 있습니다.");
  }

  await db.$transaction([
    db.member.update({ where: { id: me.id }, data: { leftAt: new Date() } }),
    // 열려 있던 기기를 전부 끊는다. 나갔는데 다른 기기로 계속 보이면 안 된다.
    db.session.deleteMany({ where: { memberId: me.id } }),
  ]);

  // 나간 사람을 뺀 인원으로 후보를 다시 만든다.
  await rebuildMeetingCandidates(me.teamId);

  await endSession();
  redirect("/join");
}

/**
 * 팀장이 팀을 넘기고 나간다 — 한 번에.
 *
 * 두 단계를 따로 두면 "넘겼는데 안 나간" 중간 상태에서 화면이 헷갈린다.
 *
 * **`transferLeadership` + `leaveTeam` 을 이어 부르는 식으로는 이걸 이룰 수 없다.** 둘 다
 * `requireSessionMember()` 으로 시작하는데 그 결과가 `cache()` 로 **요청 하나 동안** 기억된다
 * (`server/session.ts`). 두 번째 호출은 *넘기기 전* 스냅샷을 받아 팀장 지위가 그대로라
 * "팀장은 먼저 팀장을 넘기거나…"에서 던졌다. 실제로는 넘기기가 DB 에 반영된 **뒤에** 던져졌으므로,
 * 사용자는 팀장이 아닌 팀원으로 남고(기기를 새로 고치면) 다시 눌러도 `requireLeader()` 에서
 * 막힌다 — 되돌릴 수 없는 상태로 알려진 채 버려진다.
 *
 * 그래서 한 트랜잭션에서 직접 한다. 옮기고·나가고·기기 끊기를 Postgres 가 함께 처리하므로
 * 도중에 끊겨도 "팀장이 둘이거나 없는 상태"가 남지 않는다.
 */
export async function handOverAndLeave(toMemberId: string): Promise<void> {
  const leader = await requireLeader();
  const next = await nextLeaderOrThrow(leader, toMemberId);

  await db.$transaction([
    // 넘기는 것과 나가는 것을 한 행에서 함께 처리한다.
    db.member.update({ where: { id: leader.id }, data: { isLeader: false, leftAt: new Date() } }),
    db.member.update({ where: { id: next.id }, data: { isLeader: true } }),
    // 열려 있던 기기를 전부 끊는다. 나갔는데 다른 기기로 계속 보이면 안 된다.
    db.session.deleteMany({ where: { memberId: leader.id } }),
  ]);

  revalidatePath("/team", "layout");
  revalidatePath("/home");

  // 나간 사람을 뺀 인원으로 후보를 다시 만든다.
  await rebuildMeetingCandidates(leader.teamId);

  await endSession();
  redirect("/join");
}

/**
 * 프로젝트를 없앤다 — **되돌릴 수 없다.**
 *
 * 팀 행을 지우면 스키마의 cascade 를 타고 팀원·기여 기록·채팅·파일 이력이 전부 사라진다.
 * 팀장 한 사람의 선택으로 팀원들의 기록까지 없어지는 일이라, 화면에서 팀 이름을 직접
 * 적게 하고 서버에서도 한 번 더 맞춰 본다. 실수로 누를 수 있는 자리에 두지 않는다.
 */
export async function disbandTeam(confirmName: string): Promise<void> {
  const leader = await requireLeader();

  const team = await db.team.findUnique({ where: { id: leader.teamId } });
  if (!team) redirect("/join");

  if (confirmName.trim() !== team.name) {
    throw new Error("팀 이름이 맞지 않습니다.");
  }

  await db.team.delete({ where: { id: team.id } });

  await clearRemembered();
  await endSession();
  redirect("/join");
}

/**
 * 이 기기에서 로그아웃한다.
 *
 * 팀을 나가는 것(`leaveTeam`)과 다르다 — 팀원 지위(`Member`), 역할, 기여 기록, 채팅 내역은
 * 모두 그대로 유지되며, 오직 지금 브라우저의 세션(`Session` 행과 쿠키)만 끝낸다.
 * 팀장도 언제든 로그아웃할 수 있다.
 *
 * 세션을 끊기 전에 **기억 쿠키**(`cd_remember`)를 심는다. 다시 들어올 때 초대 코드와
 * 이름 입력을 건너뛰고 바로 재입장 코드 화면으로 갈 수 있게 하기 위해서다.
 */
export async function logOut(): Promise<void> {
  const member = await getSessionMember();
  if (member) {
    const team = await db.team.findUnique({
      where: { id: member.teamId },
      select: { code: true },
    });
    if (team) await setRememberCookie(team.code, member.name);
  }
  await endSession();
  redirect("/join");
}
