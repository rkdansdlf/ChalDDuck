import {
  getAiTools,
  getBoxDeadlines,
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
} from "@/data/api";
import { HomeScreen } from "@/features/home/home-screen";
import { todayInSeoul } from "@/features/schedule/week";

/** 홈 탭 — 11 홈. */
export default async function HomePage() {
  const team = await getCurrentTeam();
  const [roles, roster, recent, aiTools, tasks, negotiation, meeting, rejoinRequests, joinRequests, teamCheck, unread, boxDeadlines] =
    await Promise.all([
      getRoles(),
      getRoster(team.id),
      getRecentItems(team.id),
      getAiTools(),
      getTasks(team.id),
      getRoleNegotiation(team.id),
      getMeetingProposal(team.id),
      getRejoinRequests(team.id),
      getJoinRequests(team.id),
      getTeamCheck(team.id),
      getUnreadNotificationCount(),
      // 마감 임박 추천용 — **역할과 마감 시각만** 읽는다(파일·버전 전체는 필요 없다).
      getBoxDeadlines(team.id),
    ]);

  return (
    <HomeScreen
      team={team}
      roles={roles}
      roster={roster}
      recent={recent}
      aiTools={aiTools}
      tasks={tasks}
      negotiation={negotiation}
      meeting={meeting}
      boxDeadlines={boxDeadlines}
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
      awaitingMyConfirm={
        teamCheck.filter((r) => !r.isMine && r.state === "pending" && !r.iConfirmed).length
      }
    />
  );
}
