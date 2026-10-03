/**
 * 하네스가 **터뜨릴 수 있는 곳**에 대한 문.
 *
 * 드라이브 검사와 AI 한도 검사는 둘 다 팀·팀원·기록을 **만들고**, 첫 번째는 저장소에
 * **실제로 객체를 올렸다가 지운다.** 서버 액션은 그 경계를 지켰지만 하네스 자체는 아니다.
 *
 * 그래서 두 겹으로 확인한다 —
 *
 * 1. **로컬 DB인가.** 운영 DB 를 가리키는 채로 한 번 돌면 팀이 남고 기록이 남는다.
 * 2. **개발 버킷인가.** 운영 버킷에 남은 객체는 지우려면 실제 데이터를 건드려야 한다.
 *    `storage:check` 는 버킷의 **존재**만 보고 이 검사는 **어느 버킷에 쓰는지** 본다 —
 *    질문이 다르다.
 *
 * `smoke.mts` 가 DB 호스트만 확인하는 것과 같은 문이며, 여기서는 저장소 쪽도 함께 본다.
 * 로컬에서는 `SUBMISSIONS_BUCKET="submissions-dev"` 이 `.env.development.local` 에 있다.
 */
export function assertLocalOnly({ needsBucket = false } = {}) {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL 이 없습니다.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`이 검사는 로컬 DB 에서만 돕니다. 지금은 ${host} 를 가리킵니다.`);
  }

  if (!needsBucket) return;
  const bucket = process.env.SUBMISSIONS_BUCKET;
  if (!bucket) throw new Error("SUBMISSIONS_BUCKET 이 없습니다 — 어느 버킷에 올릴지 알 수 없습니다.");
  if (bucket === "submissions") {
    throw new Error(
      `SUBMISSIONS_BUCKET 이 운영 버킷("submissions") 을 가리킵니다. 이 검사는 개발 버킷에서만 돕습니다.`,
    );
  }
}