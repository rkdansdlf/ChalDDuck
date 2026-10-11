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

/**
 * 이 하네스는 **저장소에 손대지 않는다** — 키가 있어도.
 *
 * ## 왜 필요한가 — 2026-10-10
 *
 * `contrib`·`chat` 하네스는 DB 에 증빙·첨부 **경로만** 만들고 저장소에 파일은 올리지 않는다. 그런데 서버(`signTeamFileUrl`)는
 * 저장소 키가 있으면 **실제 저장소**에 서명 URL 을 요청하고, 저장소는 없는 객체를 `Object not found`(404) 로 거절한다.
 * 그 결과 키가 있는 로컬 환경에서만 "서명 URL 발급 성공" 검사가 실패했다. 키가 없는 CI·다른 환경에서는 통과해서,
 * **같은 코드가 환경에 따라 다른 검사를 했다.**
 *
 * 진입점의 주석은 처음부터 "저장소에 손대지 않는다" 고 했다. 말만이 아니라 **실제로 못 닿게** 한다 — 서버가 저장소를
 * 쓰는지 판단하는 값(`SUPABASE_URL`·`SUPABASE_SECRET_KEY`·`SUPABASE_SERVICE_ROLE_KEY`)을 비운다. 진짜 저장소는
 * `drive` 하네스가 개발 버킷(`needsBucket: true`)에서 본다.
 *
 * `load-env.mjs` 가 읽은 **뒤에** 부른다(dotenv 는 이미 있는 값을 덮어쓰지 않으므로 비운 값이 그대로 남는다).
 * 서버의 `isStorageConfigured()` 는 부를 때마다 이 값을 읽는다.
 */
export function withoutStorage() {
  for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    process.env[name] = "";
  }
}

/**
 * 이 하네스는 **외부 AI 모델을 부르지 않는다** — 키가 있어도.
 *
 * ## 왜 필요한가 — 2026-10-11
 *
 * `ai` 하네스의 "AI 서버 액션" 구간은 `summarizeMeeting`·`searchResearch`·`refineScript` 를 **실제 액션 경계로** 부르고
 * "성공하거나 샘플을 반환한다" 를 확인한다. 서버는 `OPENROUTER_KEY` 가 있으면 진짜 무료 모델을 부르고, 없으면 샘플을 돌려준다.
 * 그래서 키가 있는 로컬(`.env`)에서만 **외부 모델의 그날 기분**에 검사가 달렸다 — 모델이 도구 호출 없이 답하면
 * (`도구 호출이 없는 응답`) 액션이 실패로 돌아가 푸시 전 훅이 막혔다. 키가 없는 CI 는 항상 샘플 길이라 통과했다.
 * **같은 코드가 환경에 따라 다른 검사를 했고**, 그 때문에 `--no-verify` 가 반복됐다 — 저장소 키(`withoutStorage`)와 같은 모양이다.
 *
 * 이 하네스가 보는 것은 모델의 답이 아니라 **액션 경계와 기록**이다. 모델의 품질은 `npm run tool:bench` 가 같은 코퍼스로 잰다.
 * 그래서 서버가 모델을 쓰는지 판단하는 값(`OPENROUTER_KEY`)을 비운다. `ai-actions` 하네스는 같은 이유로 스스로 지우고 시작한다.
 *
 * `load-env.mjs` 가 읽은 **뒤에** 부른다(dotenv 는 이미 있는 값을 덮어쓰지 않으므로 비운 값이 그대로 남는다).
 * 서버의 `isAiConfigured()` 는 부를 때마다 이 값을 읽는다.
 */
export function withoutAi() {
  process.env.OPENROUTER_KEY = "";
}
