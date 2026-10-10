/**
 * 요청 컨텍스트를 **심는** 방법 — 모듈 갈아끼우기가 아니다.
 *
 * `next/headers` 의 `cookies()` 는 요청 밖에서 부르면 "outside a request scope" 로 죽는다.
 * 드라이브 서버 액션은 **모든 액션이 `requireSessionMember()` 으로 시작한다** — 즉 쿠키에서
 * 토큰을 꺼내 `Session` 행을 찾아 팀원을 돌려주는 그 경로가 모든 규칙의 입구다. 그 입구를
 * 지나지 않으면 서버 액션을 부르는 것이 아니라 **우회한 것**이고, "액션이 스스로 막는지"를
 * 볼 수 없다. 그러면 검사는 통과하는데 정작 막아야 할 것을 못 막는 함정이 된다.
 *
 * 그래서 ESM 모듈 교체 훅(`node:module` 의 `register`)을 먼저 시도했다가 **포기했다** —
 * `tsx` 가 자기 해석 훅을 먼저 돌려 가로채서 내 훅이 아예 호출되지 않았다. 게다가 Next 의
 * 공식 요청 저장소(`next/dist/server/app-render/work-async-storage`)를 직접 심는 방법도
 * Next  내부 구조에 깊이 묶여 있어 버전에 약하다.
 *
 * 남은 길은 하나였다. **Next 의 `next/headers` 는 CommonJS 다.** ESM 이 CommonJS 를
 * 불러올 때도 그 모듈은 `require` 로 적재되므로, **적재 전에 `require.cache` 에 자리를
 * 끼우면** 그 자리에서부터 부 맞아진다. 앱 코드는 한 줄도 안 건드리고, 교체되는 것도
 * 요청 컨텍스트 하나뿐이다 — 저장소·DB·액션은 전부 진짜다.
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

/** 화면 재검증 호출을 기록만 한다. 앱 규칙이 아니라 화면 갱신이라 내용은 보지 않는다. */
export const revalidated = [];

const SESSION_COOKIE = "cd_session";
const CREATOR_COOKIE = "cd_creator";
const jar = new Map();

function cookiesApi() {
  return {
    get: (name) => {
      if (typeof name === "object" && name !== null) name = name.name;
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    has: (name) => jar.has(name),
    set: (name, value) => {
      if (typeof name === "object" && name !== null) {
        jar.set(name.name, String(name.value));
        return;
      }
      jar.set(name, String(value));
    },
    delete: (name) => {
      if (typeof name === "object" && name !== null) name = name.name;
      jar.delete(name);
    },
    toString: () => "[cookies]",
  };
}

const nextHeadersStub = {
  async cookies() {
    return cookiesApi();
  },
  async headers() {
    return new Headers({ "user-agent": "DriveHarness/1.0" });
  },
};

const nextCacheStub = {
  revalidatePath: (path, type) => revalidated.push(`${path} (${type ?? "page"})`),
  revalidateTag: (tag) => revalidated.push(`tag:${tag}`),
  unstable_expirePath: (path, type) => revalidated.push(`${path} (${type ?? "page"})`),
  unstable_expireTag: (tag) => revalidated.push(`tag:${tag}`),
  unstable_cache: (fn) => fn,
  unstable_noStore: () => {},
};

/**
 * 테스트 전용 — 쿠키 항아리를 직접 다룬다.
 *
 * ## `nobody()` 가 `cd_session` 만 지우는 이유
 *
 * 항아리에는 **세션이 아닌 쿠키도 들어간다.** 팀을 만든 브라우저를 기억하는 `cd_creator` 가
 * 그 하나다 — 이게 있어야 "창작자가 첫 팀장" 이라는 규칙이 성립한다(창작자 쿠키는 하루 뒤
 * 지워지므로, 팀장이 없을 때를 위해 "빈 팀의 첫 사람" 규칙도 함께 있다).
 *
 * `jar.clear()` 로 항아리 전체를 비우면 **그 규칙을 검사할 수 없게 된다.** 그래서 세션만
 * 지운다. 항아리 전체를 비우는 일은 `reset()` 이라고 이름을 붙여 따로 둔다.
 */
export const session = {
  /** 이 팀원으로 행동한다. 서버 액션이 이 세션을 읽는다. */
  as(token) {
    jar.set(SESSION_COOKIE, token);
  },
  /** 세션만 지운다 — 다른 쿠키(`cd_creator`)는 남는다. */
  nobody() {
    jar.delete(SESSION_COOKIE);
  },
  /**
   * **신원 쿠키**를 지운다(세션 + 창작자). 신청인의 요청 토큰(`cd_join`)은 **남긴다.**
   *
   * 팀장 세션으로 승인한 뒤 신청인 브라우저로 돌아와야 하는 검사가 있다. 항아리 전체를
   * 비우면 **신청인이 자기 요청을 못 찾게 되어** 팀원이 되지 않는다 — 그건 버그가 아니라
   * 하네스가 브라우저를 바꿔 버린 것이다.
   */
  reset() {
    jar.delete(SESSION_COOKIE);
    jar.delete(CREATOR_COOKIE);
  },
  /** 항아리 전체를 비운다 — **다른 브라우저**가 되어야 할 때만 쓴다. */
  clearAll() {
    jar.clear();
  },
  /**
   * abuse 한계용 신원 쿠키(`cd_anon`)를 정한다.
   *
   * ## 왜 이것이 필요한가 (2026-09-28)
   *
   * 가입 abuse 한계는 `cd_anon` 쿠키를 **행 키로** 쓴다(`rate-limit/join-throttle.ts` 의
   * `hitWindow` — `INSERT … ON CONFLICT DO UPDATE` 는 **행 단위로 직렬화**된다).
   *
   * 즉 브라우저 열 개가 **하나의 항아리**(= 하나의 신원)를 쓰면 abuse 한계가 그들을 **차례로
   * 처리한다** — 팀 행 잠금을 지워도 경합이 재현되지 않았다. 처음에 그 이유를 몰라서
   * "검사가 잠금을 보고 있지 않다" 고 판단했다.
   *
   * **진짜 경합은 서로 다른 브라우저 사이에서 난다** — 각자 다른 신원을 갖고 동시에 붙을 때다.
   * 그래서 경합 검사는 신원을 하나씩 심는다.
   */
  asBrowser(anonId) {
    jar.set("cd_anon", anonId);
  },
  /** 창작자 쿠키를 심는다 — "이 브라우저가 팀을 만들었다" 를 서버가 믿게 한다. */
  asCreator(teamId) {
    jar.set(CREATOR_COOKIE, teamId);
  },
  hasCreatorCookie() {
    return jar.has(CREATOR_COOKIE);
  },
  setCookie(name, value) {
    jar.set(name, String(value));
  },
  getCookie(name) {
    return jar.get(name);
  },
  revalidated,
};

/**
 * `next/navigation` 대역.
 *
 * `src/data/api.ts` 가 `redirect` 를 가져오기 때문에 드라이브 액션의 **모듈 그래프**에 이
 * 모듈이 들어온다(액션이 그 함수를 부르는 게 아니라, 같은 파일에 있기 때문이다). 적재
 * 자체는 React 의 `createContext` 를 필요로 하는데 `react-server` 조건에서는 그게 없어서
 * 여기서 막힌다.
 *
 * 그래서 대체한다. 그리고 **위임하지 않고 반드시 던진다.** `redirect` 는 "이 화면을 떠난다"
 * 는 뜻인데, 하네스에서 그걸 그냥 통과시키면 **검증되지 않은 경로가 검증된 것처럼 보인다.**
 * 던져야 "이 경로는 이 하네스 밖이다" 가 드러난다.
 */
const nextNavigationStub = {
  redirect(to) {
    throw new Error(`__harness_redirect__:${typeof to === "string" ? to : "URL"}`);
  },
  permanentRedirect(to) {
    throw new Error(`__harness_redirect__:${typeof to === "string" ? to : "URL"}`);
  },
  notFound() {
    throw new Error("__harness_notFound__");
  },
  forbidden() {
    throw new Error("__harness_forbidden__");
  },
  unauthorized() {
    throw new Error("__harness_unauthorized__");
  },
  useRouter() {
    throw new Error("__harness_client_only__ useRouter");
  },
  usePathname() {
    throw new Error("__harness_client_only__ usePathname");
  },
  useSearchParams() {
    throw new Error("__harness_client_only__ useSearchParams");
  },
  useParams() {
    throw new Error("__harness_client_only__ useParams");
  },
  redirectStatus: 307,
};

function stub(entryId, exports) {
  const filename = require_.resolve(entryId);
  const nodeModule = require_("node:module");
  const mod = new nodeModule.Module(filename);
  mod.id = filename;
  mod.filename = filename;
  mod.loaded = true;
  mod.exports = exports;
  require_.cache[filename] = mod;
  return filename;
}

/**
 * 앱 모듈이 적재되기 **전에** 불러야 한다. 적재된 뒤에 심으면 아무 일도 일어나지 않는다
 * (이미 평가된 모듈을 다시 평가하지 않으므로).
 */
export function installRequestContext() {
  const a = stub("next/headers", nextHeadersStub);
  const b = stub("next/cache", nextCacheStub);
  const c = stub("next/navigation", nextNavigationStub);
  return { headers: a, cache: b, navigation: c };
}