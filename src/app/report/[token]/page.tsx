import { notFound } from "next/navigation";
import { getPublicReport } from "@/data/api";
import { PublicReportViewer } from "./public-report-viewer";

export const dynamic = "force-dynamic";

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getPublicReport(token);

  if (!report) {
    notFound();
  }

  return <PublicReportViewer report={report} />;
}
