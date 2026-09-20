import { notFound } from "next/navigation";
import {
  getCurrentTeam,
  getFileVersions,
  getSubmissionBox,
  getSubmittedFile,
} from "@/data/api";
import { FileViewScreen } from "@/features/drive/file-view-screen";
import { getPreviewUrl } from "@/server/actions/drive";

/**
 * 22 파일 열람·복원.
 *
 * 미리보기 주소가 짧게만 살아 있어 요청마다 렌더한다.
 */
export const dynamic = "force-dynamic";

export default async function FileViewPage({
  params,
}: PageProps<"/drive/[boxId]/[fileId]/[versionId]">) {
  const { boxId, fileId, versionId } = await params;
  const team = await getCurrentTeam();
  const [box, file] = await Promise.all([
    getSubmissionBox(team.id, boxId),
    getSubmittedFile(team.id, fileId),
  ]);
  if (!box || !file) notFound();

  const [versions, previewUrl] = await Promise.all([
    getFileVersions(team.id, fileId),
    // 비공개 버킷이라 서명된 주소를 요청 시점에 만든다.
    getPreviewUrl(versionId),
  ]);

  return (
    <FileViewScreen
      box={box}
      file={file}
      versions={versions}
      versionId={versionId}
      previewUrl={previewUrl}
    />
  );
}
