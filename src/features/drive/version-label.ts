import type { FileVersion } from "@/lib/types";

/**
 * 다음 버전 이름을 고른다.
 *
 * 이미 있는 `v<숫자>` 중 가장 큰 수 + 1. 목록 길이로 세면 `img1` 처럼 번호가 아닌
 * 항목 때문에 이미 있는 이름과 부딪힌다.
 *
 * 실제로 이름을 붙이는 쪽은 서버(`server/actions/drive.ts`)지만, 22 화면의 확인 시트가
 * "새 버전(v5)으로 추가합니다"라고 미리 말해 줘야 해서 양쪽이 같은 규칙을 봐야 한다.
 * 부수 효과 없는 순수 함수라 서버·클라이언트 어디서든 쓸 수 있다.
 */
export function nextVersionLabel(labels: Pick<FileVersion, "label">[]): string {
  const highest = labels.reduce((max, v) => {
    const matched = /^v(\d+)$/.exec(v.label);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return `v${highest + 1}`;
}
