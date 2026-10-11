import type { PrismaClient } from "../generated/prisma/client";
import type { Role } from "@/lib/types";
import { parseRoleKind } from "@/features/roles/role-rules";
import { DEFAULT_ROLES } from "./catalog";

/**
 * 팀의 **역할 목록** — `TeamRole` 행이 있으면 그것, 하나도 없으면 기본 다섯 개.
 *
 * ## 왜 이 파일 따로 있나
 *
 * `data/api.ts` 는 Next 런타임을 끌어들여(`next/headers`) `scripts/smoke.mts` 가 부를 수 없다
 * (`accepted-roles.ts` 와 같은 이유). 역할 목록은 추첨·추천·리포트가 모두 읽는 근거라 검사를 걸어야
 * 한다. 순수 조회만 이 파일에 둔다.
 *
 * ## 기본값으로 떨어지는 경우
 *
 * 행이 없으면 기본 다섯 개다 — 팀을 만들 때 행을 채우지 않는다. **행이 있는데 알 수 없는 `kind` 이면**
 * 핵심으로 읽는다: 역할을 숨기는 것보다 보이는 것이 낫고, 핵심은 "모두가 하나는 맡아야 한다" 쪽으로
 * 안전하게 기운다.
 */
type Reader = Pick<PrismaClient, "teamRole">;

export async function rolesOf(client: Reader, teamId: string): Promise<Role[]> {
  const rows = await client.teamRole.findMany({
    where: { teamId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { key: true, name: true, note: true, kind: true },
  });
  if (rows.length === 0) return DEFAULT_ROLES;
  return rows.map((r) => ({ key: r.key, name: r.name, note: r.note, kind: parseRoleKind(r.kind) ?? "core" }));
}

/**
 * 첫 편집 직전에 기본 다섯 개를 `TeamRole` 로 옮긴다. 이미 행이 있으면 아무것도 하지 않는다.
 *
 * 트랜잭션 안에서 부른다 — 옮기는 일과 그 위에 바꾸는 일이 한 덩어리여야 중간 상태(기본 중 일부만
 * 행인 팀)가 남지 않는다. 동시에 두 편집이 들어오면 `@@unique([teamId, key])` 가 한쪽을 막는다.
 */
export async function ensureTeamRoles(client: Pick<PrismaClient, "teamRole">, teamId: string): Promise<void> {
  const count = await client.teamRole.count({ where: { teamId } });
  if (count > 0) return;
  await client.teamRole.createMany({
    data: DEFAULT_ROLES.map((r, position) => ({
      teamId,
      key: r.key,
      name: r.name,
      note: r.note,
      kind: r.kind,
      position,
    })),
  });
}
