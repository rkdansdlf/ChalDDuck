/**
 * 드라이브 저장 경로 하네스 진입점 — 나머지 하네스와 **같은 심기와 같은 문**을 쓴다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly, withoutStorage } from "./safety.mjs";

assertLocalOnly();
// 이 하네스의 검사는 "저장소 키가 없는 상태"를 전제로 한다(객체 경로를 남기지 않는다·올리기 실패는 일부러 닿지 않는 주소로
// 흉내 낸다). 키가 있으면 개발 버킷에 실제로 올라가 전제가 깨지고 객체도 남는다 — 키를 비워 항상 같은 상태로 만든다.
// 진짜 저장소에 올리는 검사는 `drive` 하네스가 개발 버킷(`needsBucket: true`)에서 본다.
withoutStorage();

installRequestContext();

const { run } = await import("./drive-save.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);
