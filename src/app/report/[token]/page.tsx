import { notFound } from "next/navigation";
import { getPublicReport, getReportTokenStatus } from "@/data/api";
import { PublicReportViewer } from "./public-report-viewer";
import { ReportNotice } from "./report-notice";

export const dynamic = "force-dynamic";

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getPublicReport(token);

  if (!report) {
    const status = await getReportTokenStatus(token);
    if (status === "expired" || status === "revoked") {
      return <ReportNotice status={status} />;
    }
    notFound();
  }

  return <PublicReportViewer report={report} />;
}
