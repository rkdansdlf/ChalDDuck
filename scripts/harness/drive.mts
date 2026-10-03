/**
 * 하네스 진입점 — 앱 모듈을 **불러오기 전에** 요청 컨텍스트를 심는다.
 *
 * 순서가 전부다: 심는 코드가 먼저 평가되어야 그 자리에 스텁이 들어가고, 그 뒤에 불러온
 * 앱 모듈이 그 자리를 본다. 그래서 검사 본체를 `import` 로 정적 가져오지 않고
 * `await import()` 로 늦춘다 — 정적 가져오면 이 파일보다 먼저 평가되어 심기 전에 적재된다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";

/**
 * ⚠️ **로컬 DB 와 개발 버킷에서만 돈다.**
 *
 * 이 검사는 팀·팀원·파일을 만들고 **저장소에 실제로 객체를 올렸다가 지운다.** 마지막
 * 정리에서 지우지만, 중간에 죽으면 객체가 남는다 — 운영 버킷에 남으면 지우려면 실제
 * 데이터를 건드려야 한다. 그래서 버킷 이름을 확인한다.
 *
 * `smoke.mts` 가 DB 호스트를 확인하는 것과 같은 문이며, 저장소 쪽에도 같은 문이 필요하다.
 * 로컬에서는 `SUBMISSIONS_BUCKET="submissions-dev"` 이 `.env.development.local` 에 있다.
 */
{
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL 이 없습니다.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`드라이브 통합 검사는 로컬 DB 에서만 돕니다. 지금은 ${host} 를 가리킵니다.`);
  }
  const bucket = process.env.SUBMISSIONS_BUCKET;
  if (!bucket) throw new Error("SUBMISSIONS_BUCKET 이 없습니다 — 어느 버킷에 올릴지 알 수 없습니다.");
  if (bucket === "submissions") {
    throw new Error(
      `SUBMISSIONS_BUCKET 이 운영 버킷("submissions") 을 가리킵니다. 이 검사는 개발 버킷에서만 돕니다.`,
    );
  }
}

installRequestContext();

const { run } = await import("./drive.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);