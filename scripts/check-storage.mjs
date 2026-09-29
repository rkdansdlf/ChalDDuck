import "./load-env.mjs";

import { createClient } from "@supabase/supabase-js";

/**
 * 파일 저장소가 **지금 이 순간** 준비돼 있는지 본다.
 *
 * `db:check` 가 스키마를 보듯, 여기서는 버킷과 서명 주소를 본다. 왜 따로 두는가:
 * `isStorageConfigured()` 는 환경변수의 존재만 본다 — 실제 Supabase 프로젝트에 버킷을
 * 한 번도 만들지 않은 경우가 있다(2026-09-28 실제로 그랬다). 그 상태에서 앱은 "연결됐다"고
 * 말하면서 올리기만 조용히 실패했고, 아무 검사도 그걸 잡지 못했다.
 *
 * **서명 주소를 실제로 발급받아 본다.** 버킷이 있는지만으로는 충분하지 않다 — 키가
 * 맞지 않거나 정책이 조용히 바뀌면 버킷은 보여도 주소 발급이 안 된다. 여기까지 통과해야
 * "드라이브가 동작한다"고 말할 수 있다.
 *
 * 로컬 DB 만 쓰듯이 **운영 버킷을 만지지 않는다** — 확인은 읽기와 발급뿐이고, 발급한
 * 주소로 아무것도 올리지 않는다.
 *
 * ## 두 가지 모드
 *
 * | 부르는 법 | 설정이 없을 때 |
 * |---|---|
 * | `npm run storage:check` | **실패** — "저장소를 쓰기로 했는데 설정이 없다"는 사실 |
 * | `node scripts/check-storage.mjs --if-configured` | **통과** — 저장소를 쓰지 않는 배포를 막지 않는다 |
 *
 * 두 번째가 `vercel.json` 의 빌드 게이트다. 저장소를 **쓰기로 했는데 안 되는 경우**만
 * 막는다 — 2026-09-28 이 그 경우였다(환경변수는 다 채워져 있고 버킷이 없었는데 아무
 * 검사도 몰라서 드라이브가 조용히 실패했다).
 *
 * 반대로 **설정 자체가 없는 것**은 실패로 보지 않는다. 저장소 없이 앱을 도는 것도 가능한
 * 선택이고(`.env.example` 가 "파일 업로드만 막히고 앱은 돕다"고 적어 있다), 화면도 이미
 * "서버의 파일 저장소가 준비되지 않았습니다"라고 정직하게 말한다
 * (`server/storage/client.ts` 의 `bucketState` ). 게이트가 같은 말을 또 하지 않아도 된다.
 */

// 버킷 이름은 환경변수로 overridable — 로컬 개발이 운영 버킷에 쓰지 않게 하기 위해서다.
// 기본값은 배포본과 같다. `server/storage/client.ts` 의 `BUCKET` 과 같은 규칙이다 —
// 여기만 다르면 "확인은 통과하는데 저장은 다른 버킷에" 같은 상태가 된다.
const BUCKET = process.env.SUBMISSIONS_BUCKET || "submissions";
/** 설정이 없을 때 통과시킬지. `vercel.json` 이 이 모드로 부른다. */
const IF_CONFIGURED = process.argv.includes("--if-configured");

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ref = url ? url.replace(/^https?:\/\//, "").split(".")[0] : "";

console.log(`저장소 확인 — 프로젝트 ${ref || "(SUPABASE_URL 없음)"}`);

// 이 앱은 Supabase Auth 를 쓰지 않아 승인 요청이 없다 — 예외는 기대한 일이다.
if (!url || !key) {
  if (IF_CONFIGURED) {
    console.log(
      "\n저장소 확인: 건너뜀 — 설정이 없어 파일 저장소를 쓰지 않는 배포입니다. 통과시킵니다.",
    );
    process.exit(0);
  }
  check("SUPABASE_URL / SUPABASE_SECRET_KEY 가 있다", false, "`.env.example` 참고");
  console.log("\n저장소 확인: 실패 — 설정이 없습니다.");
  process.exit(1);
}
check("SUPABASE_URL / SUPABASE_SECRET_KEY 가 있다", true);

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: bucket, error: bucketError } = await supabase.storage.getBucket(BUCKET);
if (bucketError) {
  check(`버킷 "${BUCKET}" 이 있다`, false, bucketError.message);
  console.log(`\n저장소 확인: 실패 — 'npm run db:storage' 로 버킷을 만드세요.`);
  process.exit(1);
}
check(`버킷 "${BUCKET}" 이 있다`, true);
check("버킷이 비공개다", bucket.public === false, `public=${bucket.public}`);
check("50MB 제한이 있다", Number(bucket.file_size_limit) === 50 * 1024 * 1024, `${bucket.file_size_limit}`);

// 서명 주소를 실제로 받아 본다 — 버킷이 보여도 이것이 안 되면 올릴 수 없다.
const probePath = `${BUCKET}-check/probe`;
const { error: signError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(probePath);
if (signError) {
  check("올리기 주소를 발급받을 수 있다", false, signError.message);
  console.log("\n저장소 확인: 실패 — 키가 저장소 권한을 갖지 못했습니다.");
  process.exit(1);
}
check("올리기 주소를 발급받을 수 있다", true);

// 발급은 아무것도 남기지 않는다. 그래도 확인으로 만든 객체가 있으면 치운다.
const { error: removeError } = await supabase.storage.from(BUCKET).remove([probePath]);
if (removeError) console.warn(`  (확인용 객체 지우기 실패: ${removeError.message} — 없었을 수 있습니다)`);

console.log(
  failures === 0
    ? "\n저장소 확인: 통과 — 드라이브 업로드가 동작합니다."
    : `\n저장소 확인: ${failures}건 실패`,
);
process.exit(failures === 0 ? 0 : 1);
