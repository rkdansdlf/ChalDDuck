import {
  getCurrentTeam,
  getRecentItems,
  getJoinRequests,
  getRejoinRequests,
  getTeamCheck,
  getUnreadNotificationCount,
  getRoles,
  getMeetingProposal,
  getRoleNegotiation,
  getRoster,
  getTasks,
  getTeamSaju,
} from "@/data/api";
import { HomeScreen } from "@/features/home/home-screen";
import { todayInSeoul } from "@/features/schedule/week";

/** 홈 탭 — 11 홈. */
export default async function HomePage() {
  const team = await getCurrentTeam();
  // **최근 자료 목록은 await 하지 않는다.** "지금 나를 기다리는 일"을 먼저 그려야 하고, 이쪽은
  // 늦게 와도 된다. Promise 를 그대로 내려 가장 느린 읽기가 홈 전체를 붙잡지 않게 한다.
  // 먼저 시작해 두므로 병렬성은 그대로다. 실패해도 화면이 깨지지 않도록 빈 배열로 폴백한다.
  const recent = getRecentItems(team.id).catch(() => []);

  const [roles, roster, tasks, negotiation, meeting, rejoinRequests, joinRequests, teamCheck, unread, saju] =
    await Promise.all([
      getRoles(),
      getRoster(team.id),
      getTasks(team.id),
      getRoleNegotiation(team.id),
      getMeetingProposal(team.id),
      getRejoinRequests(team.id),
      getJoinRequests(team.id),
      getTeamCheck(team.id),
      getUnreadNotificationCount(),
      // 오늘의 팀플 흐름 — 쿼리 한 번. 실패해도 홈 전체가 깨지지 않게 `null` 로 폴백한다.
      getTeamSaju().catch(() => null),
    ]);

  return (
    <HomeScreen
      team={team}
      roles={roles}
      roster={roster}
      recent={recent}
      tasks={tasks}
      negotiation={negotiation}
      // **서버가 본 시각을 그대로 내려보낸다.** 홈의 동의 대기는 `respondBy` 와 "지금"을
      // 비교하므로, 클라이언트가 다시 재면 하이드레이션 불일치가 난다(팀 탭과 같은 이유).
      now={new Date().toISOString()}
      meeting={meeting}
      /**
       * **"오늘" 은 서버가 정한다.**
       *
       * 브리핑이 "오늘 회의" 와 "N일 뒤 마감" 을 말하는데, 그 기준을 화면이 자기 시계로 맞추면
       * **같은 팀·같은 홈이 사람마다 다른 내용을 보인다.** 기기 설정을 한국으로 둔 사람과
       * 미국으로 둔 사람의 "오늘" 이 다르다. 그래서 여기서 한 번 정해 내려보낸다.
       */
      today={todayInSeoul()}
      rejoinRequests={rejoinRequests.length + joinRequests.rows.length}
      unreadNotifications={unread}
      saju={saju}
      awaitingMyConfirm={
        teamCheck.filter((r) => !r.isMine && r.state === "pending" && !r.iConfirmed).length
      }
    />
  );
}
