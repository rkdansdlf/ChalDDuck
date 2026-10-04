import { CUSHION_LEVELS, CUSHION_TONES } from "@/data/catalog";
import {
  getCurrentTeam,
  getRoster,
  getSubmissionBoxes,
  getTeamMessages,
  getTeamReadCushion,
} from "@/data/api";
import { TeamChatScreen } from "@/features/chat/team-chat-screen";

/** 19 팀플 단톡방. */
export default async function TeamChatPage() {
  const team = await getCurrentTeam();
  // 제출함 목록은 첨부를 드라이브에 올릴 곳을 고르는 데 쓴다(14). 단톡방을 열 때마다 함께
  // 받아 오지만 쿼리는 팀 하나에 대한 `findMany` 한 번이고, 화면에 쓰는 것은 이름·마감뿐이다.
  const [page, roster, boxes, cushion] = await Promise.all([
    getTeamMessages(team.id),
    getRoster(team.id),
    getSubmissionBoxes(team.id),
    // 읽기 도움 설정. 이 방만 해당한다 — DM 은 따로 읽고 쓴다.
    getTeamReadCushion(),
  ]);

  return (
    <TeamChatScreen
      team={team}
      messages={page.messages}
      initialCursor={page.nextCursor}
      me={roster.find((m) => m.isMe)}
      boxes={boxes}
      tones={CUSHION_TONES}
      levels={CUSHION_LEVELS}
      cushion={cushion}
    />
  );
}
