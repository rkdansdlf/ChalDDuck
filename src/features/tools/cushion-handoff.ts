"use client";

/**
 * 단톡방 입력창 → 쿠션 번역기로 들고 가는 글.
 *
 * 주소(`?text=`)에 싣지 않는다 — 보내기 전의 말이 브라우저 기록과 서버 로그에 남는다.
 * 화면 전환이 클라이언트 안에서 일어나므로 모듈 변수 하나로 충분하다. 새로고침하면
 * 사라지는데, 그때는 예시 문장으로 여는 원래 동작으로 돌아갈 뿐이다.
 */
let draft: string | null = null;

export function handOffToCushion(text: string) {
  draft = text.trim() || null;
}

/** 넘겨받은 글을 본다. 지우지는 않는다 — 개발 모드의 두 번 렌더에서 두 번째가 빈손이 된다. */
export function peekCushionDraft(): string | null {
  return draft;
}

/** 화면에 옮겨 담은 뒤 부른다. 다음에 메뉴로 열었을 때 지난 글이 다시 나오지 않게 한다. */
export function clearCushionDraft() {
  draft = null;
}
