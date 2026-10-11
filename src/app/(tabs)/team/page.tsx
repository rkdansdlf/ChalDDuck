import {
  getCurrentTeam,
  getRandomTools,
  getJoinRequests,
  getRejoinRequests,
  getRoleNegotiation,
  getRoles,
  getRoster,
  getTeamInvites,
} from "@/data/api";
import { RosterScreen } from "@/features/roles/roster-screen";
import { getSessionMember } from "@/server/session";

/** 팀 탭 — 07 팀 역할 조율. */
export default async function TeamPage() {
  const team = await getCurrentTeam();
  const session = await getSessionMember();
  // **서버가 본 시각을 그대로 내려보낸다.** 07 화면의 동의 대기는 `respondBy` 와 "지금"을
  // 비교해 상태를 정하는데, 클라이언트가 새벽에 `new Date()` 로 다시 재면 서버가 그린 것과
  // 다른 그림이 그려진다(하이드레이션 불일치). 시각은 읽는 곳에서 한 번만 정한다.
  const now = new Date().toISOString();
  // 휴대폰에서 QR을 찍을 수 있어야 초대가 통한다 — localhost 링크는 휴대폰에서 안 열리므로
  // 운영/LAN 주소(APP_URL)를 초대 링크의 기점으로 쓴다. 없으면 지금 주소가 그대로 쓰인다.
  const inviteOrigin = process.env.APP_URL?.replace(/\/$/, "") || undefined;
  const [roles, roster, tools, negotiation, rejoinRequests, joinRequests, invites] =
    await Promise.all([
      getRoles(),
      getRoster(team.id),
      getRandomTools(),
      getRoleNegotiation(team.id),
      getRejoinRequests(team.id),
      getJoinRequests(team.id),
      getTeamInvites(team.id),
    ]);

  return (
    <RosterScreen
      team={team}
      roles={roles}
      roster={roster}
      tools={tools}
      negotiation={negotiation}
      now={now}
      rejoinPending={rejoinRequests.length + joinRequests.rows.length}
      /** 초대 관리는 팀장만 한다. `getTeamInvites` 도 팀장만 읽지만, 화면을 그리기 전에
          클라이언트도 알아야 해서 여기도 본다 — 못 보면 버튼을 아예 띄우지 않는다. */
      invites={session?.isLeader ? invites : []}
      isLeader={session?.isLeader ?? false}
      inviteOrigin={inviteOrigin}
    />
  );
}
