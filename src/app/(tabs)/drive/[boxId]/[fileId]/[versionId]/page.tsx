import { notFound } from "next/navigation";
import { getCurrentTeam, getFileVersions, getFileViewContext } from "@/data/api";
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
  // 제출함과 파일을 **한 번에** 읽는다. 따로 읽으면 팀의 모든 제출함·파일·버전을 훑고
  // 하나씩 골라내느라 같은 행을 여러 번 읽게 된다.
  const context = await getFileViewContext(team.id, boxId, fileId);
  if (!context) notFound();
  const { box, file } = context;

  const [versions, previewUrl] = await Promise.all([
    getFileVersions(team.id, fileId),
    // 비공개 버킷이라 서명된 주소를 요청 시점에 만든다. **주소의 `fileId` 와 `versionId` 가
    // 같은 파일인지 서버가 확인한다** — 예전에는 팀 안의 버전이면 그랬고, 그래서
    // A 파일의 정보 위에 B 파일의 내용이 그려졌다.
    getPreviewUrl(versionId, fileId),
  ]);

  // 주소를 바꿔치기해 다른 파일의 버전을 열면 **아무것도 보여 주지 않는다.** 예전에는
  // A 파일의 이름·작성자·마감 배지 위에 B 파일의 그림이 그려졌는데, 그게 고쳐져도 화면은
  // "파일을 열 수 없습니다"만 보여 주면 사용자는 자기 주소를 잘못 쳤다고도, 누가 바꿔치기
  // 했다고도 알 수 없다. 어느 쪽인지 분명히 말하는 편이 낫다.
  if (!versions.some((v) => v.id === versionId)) notFound();

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
