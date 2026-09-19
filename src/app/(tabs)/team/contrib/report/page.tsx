import { getContribReport, getCurrentTeam } from "@/data/api";
import { ContribReportScreen } from "@/features/contrib/contrib-report-screen";

/**
 * 18 기여도 · 1장 PDF.
 *
 * 리포트에는 발행일이 찍힌다. 빌드 시점에 굳으면 어제 날짜가 박힌 문서가 나오므로
 * 요청마다 렌더한다.
 */
export const dynamic = "force-dynamic";

export default async function ContribReportPage() {
  const team = await getCurrentTeam();
  const rows = await getContribReport(team.id);

  const issuedOn = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
    .format(new Date())
    .replace(/\.$/, "");

  return <ContribReportScreen team={team} rows={rows} issuedOn={issuedOn} />;
}
