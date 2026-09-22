"use server";

import { readNavBadges, type NavBadges } from "@/server/nav/badges";
import { requireSessionMember } from "@/server/session";

/**
 * 배지 숫자를 다시 세어 준다. 내비게이션이 주기적으로 부른다.
 *
 * 첫 숫자는 탭 셸이 서버에서 그려 주고, 이 액션은 그 뒤를 따라가는 값이다 —
 * 팀원이 방금 한 일(가입 요청·회의 제안·기여 기록)이 내가 아무것도 누르지 않아도
 * 배지에 나타나야 하기 때문이다.
 */
export async function pollNavBadges(): Promise<NavBadges> {
  const me = await requireSessionMember();
  return readNavBadges(me);
}
