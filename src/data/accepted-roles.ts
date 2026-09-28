import type { PrismaClient } from "../generated/prisma/client";
import type { RoleKey } from "@/lib/types";

/**
 * 팀의 **확정된** 역할 배정 — 사람 하나가 맡은 역할들.
 *
 * ## 왜 이 파일 따로 있나
 *
 * `data/api.ts` 는 Next 런타임을 끌어들인다(`next/headers`). 그래서 `scripts/smoke.mts` 는 그
 * 파일의 함수를 **불러서 검사할 수 없다** — 부르면 부팅 단계에서 죽는다. 역할 배정 규칙은
 * 성적 근거 문서(18 리포트)에 그대로 나오므로 검사를 걸어야 하는데, 그 길이 막혀 있었다.
 * 순수 조회만 이 파일로 빼서(`last-message.ts` 와 같은 이유) 불변식을 직접 돌린다.
 *
 * ## 왜 확정 배정을 따로 읽나
 *
 * "이 사람이 무슨 역할인가"를 **희망**으로 읽는 곳이 있으면 반드시 나중에 어긋난다.
 * `Member.wantRole` 은 **희망**이고 끝까지 희망이다 — 룰렛 수락이 지켜지지 않는다.
 * (`acceptRoleDraw` 는 `RoleDraw.accepted` 와 제출함 주인만 고치고 이 필드는 손대지 않는다.)
 *
 * 그래서 **`hope` 의 의미를 바꾸지 않는다.** 바꾸면 같은 필드가 시점에 따라 다른 뜻이 되어,
 * 지금 리포트에서 고치는 것보다 찾기 어려운 버그가 된다. 여기서 **파생만** 한다.
 *
 * ## 무엇이 "확정"인가
 *
 * **`accepted: true` 인 추첨이 곧 확정 배정이다.** 별도의 최신성 검사가 필요 없다:
 * - 거절은 **행을 지운다**(`server/actions/roles.ts`) — 거절된 결과는 존재하지 않는다.
 * - 다시 뽑기는 결과가 있으면 막힌다(`settled`) — 확정된 추첨은 덮어쓰이지 않는다.
 * - 수락은 `accepted: false` 를 조건으로 건다 — 한 번 참이 되면 되돌아가지 않는다.
 * - 역할마다 행이 하나뿐이다(`@@unique([teamId, role])`).
 *
 * **당첨자가 나간 뒤에도 배정은 유효하다.** 배정은 이미 끝난 사실이기 때문이다 — 무효로
 * 처리해 다시 뽑게 하면 담당자가 누구였는지가 이력에서 사라진다. 07 화면의 `roleViewOf` 도
 * 같은 순서로 본다("확정이 무효보다 먼저다").
 *
 * @returns 사람 id → 맡은 역할 키들. **없으면 키가 없다.** 희망으로 대신 채우지 않는다 —
 *         성적 근거 문서에서 없는 역할을 희망으로 메우면 그 버그가 그대로 숨어 버린다.
 */
export async function acceptedRoleAssignments(
  client: PrismaClient,
  teamId: string,
  known: readonly string[],
): Promise<Map<string, RoleKey[]>> {
  const draws = await client.roleDraw.findMany({
    where: { teamId, accepted: true },
    select: { role: true, winnerId: true },
  });

  const allowed = new Set(known);
  const byMember = new Map<string, RoleKey[]>();
  for (const draw of draws) {
    // 모르는 역할 값이 들어오면 없는 이름을 지어내지 않는다 — 조용히 뺀다.
    if (!allowed.has(draw.role)) continue;
    const role = draw.role as RoleKey;
    byMember.set(draw.winnerId, [...(byMember.get(draw.winnerId) ?? []), role]);
  }
  return byMember;
}
