import { getTeamByCode } from "@/data/api";
import { getRemembered } from "@/server/session";
import { JoinScreen } from "@/features/onboarding/join-screen";

/**
 * 01 초대 링크 입장.
 *
 * 초대 링크는 `/join?code=CD-AB12` 형태다. 코드가 없거나 맞지 않으면 팀 정보를 보여 줄 수
 * 없으므로 코드를 묻는 화면이 된다 — 아무 팀이나 대신 보여 주면 잘못된 팀에 들어간다.
 *
 * **기억 쿠키**(`cd_remember`)가 있으면 이전에 로그아웃한 팀·이름을 꺼내, 초대 코드와
 * 이름 입력을 건너뛰는 바로가기를 보여 준다. 초대 링크가 있을 때는 그쪽이 우선이다.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { code } = await searchParams;
  // **서버는 저장소를 모른다** — `sessionStorage` 는 브라우저에만 있다. 그래서 기억한 팀은
  // 클라이언트 주소로 되돌린다(`JoinScreen` 의 effect).
  const requested = typeof code === "string" ? code.trim() : "";
  const team = requested ? await getTeamByCode(requested) : null;

  // 기억 쿠키: 초대 코드가 주소에 없을 때만 — 초대 링크로 들어왔으면 그 팀을 보여 준다.
  let returning: { teamCode: string; name: string; teamName: string; course: string } | null = null;
  if (!requested) {
    const saved = await getRemembered();
    if (saved) {
      const savedTeam = await getTeamByCode(saved.teamCode);
      if (savedTeam) {
        returning = {
          teamCode: saved.teamCode,
          name: saved.name,
          teamName: savedTeam.name,
          course: savedTeam.course,
        };
      }
    }
  }

  return <JoinScreen team={team} requestedCode={requested} returning={returning} />;
}
