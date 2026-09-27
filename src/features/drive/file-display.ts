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
 * **여기서 던지지 않는다.** 서버 액션은 로그인이 풀렸거나 저장소가 잠잠할 때 던지고,
 * 운영 빌드는 그 문구를 지운다(`server/actions/ai.ts` 가 같은 이유로 적어 둔다). 예전에는
 * `false` 만 처리하고 예외는 그대로 둬서, 내려받기 버튼이 조용히 죽은 것처럼 보였다.
 * 화면이 `false` 와 진짜 실패를 다른 말로 나누어 보여 주도록 결과로 돌려준다.
 */
export type DownloadOutcome =
  /** 내려받기가 시작했다. */
  | "started"
  /** 내려받을 파일 자체가 없다(시드 데이터·저장소 미연결). */
  | "no-file"
  /** 서버가 말해 주지 못한 이유로 실패했다(세션 만료·저장소 오류). */
  | "failed";

export async function downloadVersion(versionId: string): Promise<DownloadOutcome> {
  let url: string | null;
  try {
    url = await getDownloadUrl(versionId);
  } catch {
    return "failed";
  }
  if (!url) return "no-file";
  window.location.href = url;
  return "started";
}

/** 결과에 맞춰 화면에 보여 줄 말. */
export const DOWNLOAD_FAILED_TEXT: Record<Exclude<DownloadOutcome, "started">, string> = {
  "no-file": "이 버전에는 내려받을 파일이 없습니다",
  failed: "내려받지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};
