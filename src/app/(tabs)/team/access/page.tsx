import { getCurrentTeam, getMyDevices, getRejoinRequests } from "@/data/api";
import { AccessScreen } from "@/features/onboarding/access-screen";
import { requireSessionMember } from "@/server/session";

/**
 * 계정과 기기 — 재입장 승인(팀장), 내 기기, 재입장 코드 재발급.
 *
 * 세션·기기 상태를 보여 주므로 요청마다 렌더한다.
 */
export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const me = await requireSessionMember();
  const team = await getCurrentTeam();
  const [requests, devices] = await Promise.all([getRejoinRequests(team.id), getMyDevices()]);

  return <AccessScreen requests={requests} devices={devices} isLeader={me.isLeader} />;
}
