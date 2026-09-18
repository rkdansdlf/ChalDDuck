import { redirect } from "next/navigation";

/**
 * 진입점.
 *
 * 찰떡은 가입·로그인이 없고 초대 링크로 들어오는 앱이라, 루트는 보여 줄 화면이 따로 없다.
 * 01 초대 링크 입장으로 보낸다.
 *
 * TODO(서버): 이미 팀에 들어간 세션이면 `/home` 으로 보내야 한다.
 */
export default function RootPage() {
  redirect("/join");
}
