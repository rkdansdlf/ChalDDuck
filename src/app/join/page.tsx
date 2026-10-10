import { getTeamByCode } from "@/data/api";
import { getRemembered } from "@/server/session";
import { JoinScreen } from "@/features/onboarding/join-screen";
import { forgetInviteToken, rememberInviteToken } from "@/server/invite/cookie";
import { resolveJoinTarget } from "@/server/invite/resolve-target";

/**
 * 01 초대 링크 입장.
 *
 * ## 두 종류의 입장이 있다
 *
 * - `/join?code=CD-AB12` — 사람이 옮겨 적은 코드. 예전부터 있던 길이다.
 * - `/join?t=<토큰>` — 초대 **링크**. 공유 한 번마다 다른 토큰이고, 각각 따로 되돌릴 수 있다.
 *
 * `?t=` 로 들어오면 팀 코드 해석이 아니라 `TeamInvite` 한 장을 해석한다(`resolve-target.ts`).
 * 해석에 성공한 **원문 토큰만 쿠키에 심는다** — 화면이 이 값을 다시 보게 하려 하지 않는다.
 * 심은 값은 온보딩이 끝날 때까지 `joinTeam` 이 "이 요청은 어느 공유로 왔나"를 적는 데 쓴다.
 *
 * ⚠️ **`?t=` 는 권한이 아니다.** 심어도 팀장 승인은 그대로 받는다. 그건 초대가 "신청할 수
 * 있음"이지 "들어갈 수 있음"이 아니기 때문이다 — `cookie.ts` 머리말.
 *
 * **기억 쿠키**(`cd_remember`)가 있으면 이전에 로그아웃한 팀·이름을 꺼내, 초대 코드와
 * 이름 입력을 건너뛰는 바로가기를 보여 준다. 초대 링크가 있을 때는 그쪽이 우선이다.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { code, t } = await searchParams;
  // **서버는 저장소를 모른다** — `sessionStorage` 는 브라우저에만 있다. 그래서 기억한 팀은
  // 클라이언트 주소로 되돌린다(`JoinScreen` 의 effect).
  const token = typeof t === "string" ? t.trim() : "";
  // 링크 토큰이 있으면 그 길로만 판정하며, 코드 파라미터로 떨어지지 않는다.
  // 되돌린 초대가 그 사실조차 숨기면 안 된다(resolve-target.ts 머리말).
  const requested = token ? "" : typeof code === "string" ? code.trim() : "";

  // 링크 토큰이 있으면 그 길로만, 없으면 입력된 코드로 팀/초대를 판정한다.
  const fromTarget = token
    ? await resolveJoinTarget({ token })
    : requested
      ? (await resolveJoinTarget({ code: requested })) ??
        (!requested.toUpperCase().startsWith("CD-")
          ? await resolveJoinTarget({ code: `CD-${requested}` })
          : null)
      : null;

  if (fromTarget?.invite && token) {
    await rememberInviteToken(token);
  } else if (!token) {
    // 초대 토큰 링크 없이 직접 코드로 들어온 경우, 이전 팀의 초대 쿠키 잔류를 비운다.
    await forgetInviteToken();
  }

  const invalidInvite = Boolean(token && !fromTarget);

  const team = fromTarget
    ? {
        id: fromTarget.teamId,
        name: fromTarget.teamName,
        course: fromTarget.teamCourse,
        code: fromTarget.teamCode,
        // 사람 수와 마감일을 초대가 세어 온다. 여기서 0 / null 로 박아 넣으면, 팀이
        // 비어 있지 않아도 "0명" 으로 보인다 — 코드 길과 같은 정보를 두 길이 다르게 보여 주는
        // 셈이라 화면이 스스로를 모순한다.
        memberCount: fromTarget.memberCount,
        dday: fromTarget.teamDday,
      }
    : null;

  // 기억 쿠키: 어느 입장이든 없을 때만 — 초대 링크나 코드로 들어왔으면 그 팀을 우선한다.
  let returning: { teamCode: string; name: string; teamName: string; course: string } | null = null;
  if (!fromTarget && !requested) {
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

  return (
    <JoinScreen
      team={team}
      requestedCode={requested}
      returning={returning}
      invalidInvite={invalidInvite}
    />
  );
}
