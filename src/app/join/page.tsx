import { getTeamByCode } from "@/data/api";
import { JoinScreen } from "@/features/onboarding/join-screen";

/**
 * 01 초대 링크 입장.
 *
 * 초대 링크는 `/join?code=CD-AB12` 형태다. 코드가 없거나 맞지 않으면 팀 정보를 보여 줄 수
 * 없으므로 코드를 묻는 화면이 된다 — 아무 팀이나 대신 보여 주면 잘못된 팀에 들어간다.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { code } = await searchParams;
  const requested = typeof code === "string" ? code.trim() : "";
  const team = requested ? await getTeamByCode(requested) : null;

  return <JoinScreen team={team} requestedCode={requested} />;
}
