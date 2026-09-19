import { notFound } from "next/navigation";
import { getCurrentTeam, getFileVersions, getSubmissionBox } from "@/data/api";
import { FileViewScreen } from "@/features/drive/file-view-screen";

/** 22 파일 열람·복원. */
export default async function FileViewPage({ params }: PageProps<"/drive/[boxId]/[versionId]">) {
  const { boxId, versionId } = await params;
  const team = await getCurrentTeam();
  const box = await getSubmissionBox(team.id, boxId);
  if (!box) notFound();

  const versions = await getFileVersions(team.id, boxId);
  return <FileViewScreen box={box} versions={versions} versionId={versionId} />;
}
