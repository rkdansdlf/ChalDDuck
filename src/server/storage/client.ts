import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage 한 겹.
 *
 * ⚠️ **비밀 키(Secret key)를 쓴다.** 이 앱은 Supabase Auth 를 쓰지 않아서(가입·로그인이
 * 없는 제품이다) 저장소의 RLS 가 판단할 사용자가 없다. 그래서 버킷을 비공개로 두고 **접근
 * 권한은 앱이 직접 확인한다** — 모든 저장소 호출 앞에 `requireSessionMember()` 와
 * "우리 팀 것인지" 확인이 붙는다.
 *
 * 그래서 이 모듈은 서버 전용이다. 이 키가 브라우저로 나가면 저장소 전체가 열린다.
 */

/**
 * 제출 파일이 들어가는 버킷. 비공개이고, 내려받기는 서명된 주소로만 한다.
 *
 * **이름을 환경변수로 둘 수 있다** — 로컬 개발이 운영 버킷에 쓰지 않게 하기 위해서다
 * (`SUBMISSIONS_BUCKET`). 경로는 팀 id 로 시작하므로(`server/actions/drive.ts`) 서로 다른
 * 팀의 파일이 섞이지 않지만, 운영 버킷에 개발 중 올린 파일이 계속 쌓이고 그건 되돌릴 수
 * 없다(지우려면 운영 데이터를 건드려야 한다). 그래서 기본값은 그대로 두고, 개발 환경만
 * 다른 버킷을 가리키게 한다.
 */
export const BUCKET = process.env.SUBMISSIONS_BUCKET || "submissions";

/**
 * 저장소에 쓸 비밀 키.
 *
 * Supabase 가 키 이름을 바꿨다 — 새 이름은 **Secret key**(`sb_secret_...`), 예전 이름은
 * `service_role`(JWT, `eyJ...`)이고 2026년 말 폐기 예정이다. 둘 다 받아 두면 지금 발급한
 * 키도, 이미 쓰던 키도 그대로 동작한다.
 */
function secretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * 환경 변수가 있는지만 본다. **버킷이 있는지는 보지 않는다.**
 *
 * 이 함수만으로는 "연결됐다"고 말할 수 없다 — 실제로는 버킷을 한 번도 만들어 준 적이 없는
 * Supabase 프로젝트가 있다(2026-09-28 확인). 환경 변수는 다 채워져 있는데 버킷이 없으면
 * 올리기 주소 발급이 실패하고, 그때까지 이 함수는 `true` 를 말하고 있었다. 그래서
 * "없음"의 기준을 두 겹으로 나눈다 — 여기는 값의 존재, `isBucketMissing()` 은 버킷의 존재.
 */
export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && secretKey());
}

let cached: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = secretKey();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY 가 없습니다. `.env.example` 을 참고하세요.",
    );
  }

  cached ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function storage() {
  return supabase().storage.from(BUCKET);
}

/** 확인 중인 요청. 동시에 여럿이 물어도 저장소에는 한 번만 간다. */
let bucketChecked: Promise<BucketState> | null = null;
/** 마지막 확인의 결과. 버킷은 사라지지 않으므로 이것만은 인스턴스 수명 동안 믿는다. */
let bucketOk = false;

/**
 * 버킷이 있는지를 확인한 결과.
 *
 * - `"ok"` — 있다.
 * - `"missing"` — **버킷이 없다.** 사용자에게 "저장소가 준비되지 않았다"고 말해도 되는 상태.
 * - `"unknown"` — **모른다.** 닿지 않았거나 키를 못 알아봤다. 이때는 `missing` 와
 *   구분해야 한다 — 잘못된 키도 여기로 온다(실측: `Invalid Compact JWS`). 이것을 `missing`
 *   로 말하면 "설정을 고치세요"라는 엉뚱한 안내가 된다. */
type BucketState = "ok" | "missing" | "unknown";

/**
 * Supabase 가 버킷 부재를 이렇게 말한다(실측 2026-09-28).
 *
 * 문구로 가려내지 않는다 — 대신 **성공했을 때만** `missing` 가 아니다라고 말한다. 성공하면
 * `getBucket` 이 버킷을 돌려주므로 부재일 수 없다. 실패했을 때의 문구는 여러 가지가 있고
 * (키가 틀렸으면 `Invalid Compact JWS`, 프로젝트가 없으면 `fetch failed`) 그중 무엇이
 * "버킷 없음"인지는 Supabase 의 응답을 따라야 한다.
 */
export function isMissingBucketError(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  if (error.statusCode === 404) return true;
  return /bucket not found|not found.*bucket/i.test(error.message ?? "");
}

/**
 * 버킷 상태를 한 번 확인한다.
 *
 * 성공은 이 인스턴스의 수명 동안 기억한다 — 버킷이 새로 생기는 일은 없고, 올리기마다
 * 확인 요청을 넣을 이유도 없다. 실패(없음·닿지 못함)는 기억하지 **않는다** — 버킷을 만든
 * 직후엔 곧바로 보여야 하기 때문이다.
 *
 * 이 함수를 부르는 곳은 **저장소 호출이 이미 실패한 뒤**다. 정상 길에 확인을 끼우면
 * 올리기 한 번에 요청이 하나 늘어난다.
 */
export async function bucketState(): Promise<BucketState> {
  if (!isStorageConfigured()) return "missing";
  // 한 번 확인해 보니 있었다면 다시 묻지 않는다.
  if (bucketOk) return "ok";

  bucketChecked ??= supabase()
    .storage.getBucket(BUCKET)
    .then(({ data, error }) => {
      if (!error && data) {
        bucketOk = true;
        return "ok" as BucketState;
      }
      return isMissingBucketError(error) ? ("missing" as BucketState) : ("unknown" as BucketState);
    })
    .catch(() => "unknown" as BucketState)
    .finally(() => {
      bucketChecked = null;
    });

  return bucketChecked;
}

/**
 * 저장소 호출이 실패했을 때 — **버킷이 없는 것인지, 다른 일인지**를 가려 준다.
 *
 * 구분하지 않으면 둘이 같은 예외로 보인다. 실제로는 다르다 — 버킷이 없는 건 설정 한 줄로
 * 끝나고(2026-09-28 실제로 그랬다), 다른 일은 원인마다 다르다. 그래서 **버킷 부재를
 * 확인한 뒤에만** 사용자에게 저장소가 준비되지 않았다고 말한다. 확인하지 않고 그렇게
 * 말하면, 잠깐 끊겼을 때도 "연결이 안 됐다"고 말해 사람과 서버 양쪽을 속인다.
 *
 * @param where 어느 호출이 실패했는지 — 서버 로그에만 남는다.
 * @returns `missingBucket` 이면 `not-configured` 를 돌릴 수 있다. 아니면 `message` 를 던진다.
 */
export async function explainStorageFailure(
  where: string,
  error: unknown,
): Promise<{ missingBucket: true } | { missingBucket: false; message: string }> {
  const state = await bucketState();
  if (state === "missing") {
    console.error(
      `[storage] ${where} 실패 — 버킷 "${BUCKET}" 이(가) 없습니다. 'npm run db:storage' 로 만드세요.`,
      error,
    );
    return { missingBucket: true };
  }

  // 버킷이 있거나, 원인을 몰라서 말할 수 없다. "설정이 잘못됐다"고 단정하지 않는다.
  console.error(`[storage] ${where} 실패 (버킷 상태: ${state}):`, error);
  return { missingBucket: false, message: "저장소가 응답하지 않습니다." };
}
