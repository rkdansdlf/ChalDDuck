import type { IconName } from "@/components/ui";
import type { FileKind } from "@/lib/types";
import { getDownloadUrl } from "@/server/actions/drive";

/**
 * 파일 형식마다 쓰는 아이콘.
 *
 * 예전에는 이미지가 아니면 전부 `file-x` 였다 — 멀쩡한 발표 자료가 "깨진 파일"처럼 보였다.
 * 열 수 있는지는 아이콘이 아니라 열람 화면의 안내로 말한다.
 */
export const KIND_ICON: Record<FileKind, IconName> = {
  pptx: "presentation",
  docx: "file-text",
  pdf: "file",
  image: "file-image",
};

/**
 * 한 버전을 내려받는다.
 *
 * 버킷이 비공개라 주소를 미리 들고 있을 수 없다 — 누를 때마다 서버에서 짧게 사는
 * 서명된 주소를 받아 연다. 주소에 `download` 가 붙어 있어 화면을 떠나지 않고 저장된다.
 *
 * @returns 내려받을 실제 파일이 없으면(시드 데이터·저장소 미연결) `false`. 부르는 쪽이 알린다.
 */
export async function downloadVersion(versionId: string): Promise<boolean> {
  const url = await getDownloadUrl(versionId);
  if (!url) return false;
  window.location.href = url;
  return true;
}
