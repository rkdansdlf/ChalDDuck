import { db, check, truthy, readCode, finish } from "./db-test-base.mjs";
import { clearWindow, hitWindow, readWindow } from "../src/server/rate-limit/window.js";
import { EXPIRY_CHOICES, USE_CHOICES } from "../src/server/invite/choices.js";
import {
  INVITE_TOKEN_LENGTH,
  looksLikeInviteToken,
  newInviteToken,
} from "../src/server/auth/invite-token.js";
import { isInviteUsable } from "../src/server/invite/rules.js";
import {
  clientGate,
  isJoinCapped,
  JOIN_LIMIT,
  teamGate,
} from "../src/server/rate-limit/policy.js";

/**
 * 초대 · 가입 승인 불변식 — `smoke.mts` 에서 **별도 파일로 꺼낸 이유가 있는 부분만** 담는다.
 *
 * ## 왜 이것만 꺼냈는가
 *
 * 초대·가입은 되돌리기 어려운 일이다. 한 번 승인되면 그 사람은 그 팀원이 되고, 다시 뺄 수
 * 없다. 그래서 여기 모인 검사는 전부 **"결정을 되돌릴 수 없을 때만 증명하는 것"** 이다.
 *
 * 이 부분을 몫까지 두지 않은 이유는 두 가지였다.
 *
 * **1. 다른 편집이 이 테스트를 지웠다.** 한 파일이 4884줄이었다. 그 안의 한 부분만 고치는
 * 일이 파일 전체를 되쓰다가 되돌리는 일로 번지고, 그래서 초대 검사가 **조용히 사라졌다** —
 * 복구하지 못했다. 이 파일은 그 면에서 **독립**이다. `smoke.mts` 가 무엇을 해도 여기 있는
 * 검사는 살아 있다.
 *
 * **2. 실기기에서 드러난 결함을 여기서 먼저 잡는다.** 이름 겹침을 팀장이 승인하려 할 때,
 * 어리석은 쪽으로 넘어가는 것이 아니라 **그 자리에서 멈춰야 한다**(2026-09-29 실측).
 *
 * ## 검사의 두 종류
 *
 * - **순수 판정** — 화면과 서버가 함께 쓰는 계산을 직접 부른다(`clientGate`).
 * - **코드 구조** — 서버 액션이 **무엇을 하는지** 를 소스에서 고정한다(어디서 막고,
 *   무엇을 덮어쓰지 않는가). 서버 액션 자체는 부르지 않는다 — 쿠키를 만들어 부르면
 *   "액션이 정상"이 아니라 **"액션을 우회했다"** 는 사실만 테스트하게 된다.
 * - **DB 불변식** — 유일 인덱스와 조건을 실제 Postgres 에 건다.
 *
 * **로컬 DB 에서만 돈다.** `db-test-base.mts` 가 시작 전에 확인한다.
 */
/* ── 가입 요청 제한: 순수 판정 ─────────────────────────────────── */


/* ── 가입 요청 제한: 순수 판정 ─────────────────────────────────── */

console.log("\n가입 요청 제한 (화면·서버가 같은 순수 함수를 부른다)");
{
  // `clientGate` 의 비교는 `>` 다 — 막은 시도까지 이미 창에 찍혀 있으므로 `max` 번까지는
  // 통과한다. `>=` 로 바뀌면 한 번 일찍 막히고, 이 테스트가 바로 그걸 잡는다.
  check("10분 창은 5회까지 통과한다", clientGate(5, 0), "open");
  check("10분 창은 6번째에 막는다", clientGate(6, 0), "client");
  check("1시간 창은 15회까지 통과한다", clientGate(1, 15), "open");
  check("1시간 창이 넘으면 짧은 창이 멀쩡해도 막는다", clientGate(1, 16), "client");

  // 팀 예산은 쿠키를 지워도 남는 방어선이라 넉넉하다. 좁으면 정상 팀원이 못 들어온다.
  check("팀 10분 창은 20회까지 통과한다", teamGate(20, 0, 0), "open");
  check("팀 10분 창은 21번째에 막는다", teamGate(21, 0, 0), "team-budget");
  check("팀 1시간 창은 50회까지 통과한다", teamGate(0, 50, 0), "open");
  check("팀 1시간 창은 51번째에 막는다", teamGate(0, 51, 0), "team-budget");

  // 시간 창을 한 번도 넘지 않고도 개수로 막힌다 — 느린 공격의 유일한 방어선.
  check("시간은 넉넉해도 미해결 49건까지는 된다", teamGate(0, 0, 49), "open");
  check("미해결 50건부터 막는다", teamGate(0, 0, JOIN_LIMIT.unresolvedPerTeam), "pending-cap");
  check("배너는 상한 직전에는 안 뜬다", isJoinCapped(JOIN_LIMIT.unresolvedPerTeam - 1), false);
  check("배너는 상한부터 뜬다", isJoinCapped(JOIN_LIMIT.unresolvedPerTeam), true);
}

/* ── 횟수표: 동시에 찍어도 새지 않는다 ────────────────────────── */

console.log("\n횟수표 (동시에 찍어도 합이 정확하다)");
{
  const key = `smoke:window:${Date.now()}`;
  const WINDOW_MS = 10 * 60 * 1000;

  // **아무도 안 찍은 상태에서 50 개를 한꺼번에 넣는다.** 예전 구현(`findUnique` → 판단 →
  // 쓰기) 은 여기서 대부분 을 잃었다 — 모두 0 을 읽고 모두 1 을 적으면 50 이 아니라 1 이 남는다.
  // 우연히 스레드풀을 타면 통과하는 검사가 되므로, DB 한 문장으로 직렬화되는지(`ON CONFLICT`)
  // 를 이 스모크가 실제로 눌러 본다.
  const RACERS = 50;
  const counts = await Promise.all(
    Array.from({ length: RACERS }, () => hitWindow(key, WINDOW_MS)),
  );

  check("50 개를 동시에 찍어도 마지막 값이 50 이다", await readWindow(key), RACERS);
  check("돌려준 값이 중복되지 않는다", new Set(counts).size, RACERS);
  check("돌려준 값이 1..50 을 다 덮는다", counts.slice().sort((a, b) => a - b), Array.from({ length: RACERS }, (_, i) => i + 1));

  // 창은 **첫 시도 때 정해지고 늘어나지 않는다.** 시도할 때마다 뒤로 밀면, 막힌 사람이 계속
  // 눌러 보는 동안 영영 안 풀린다 — 그래서 뒤로 밀면 안 된다.
  const row = await db.rejoinAttempt.findUnique({ where: { key } });
  const firstUntil = row!.until.getTime();
  await hitWindow(key, WINDOW_MS);
  const again = await db.rejoinAttempt.findUnique({ where: { key } });
  check("더 찍어도 창이 뒤로 밀리지 않는다", again!.until.getTime(), firstUntil);
  check("더 찍으면 횟수만 오른다", again!.count, RACERS + 1);

  // 맞히면 지워진다 — 다음에 한 번만 해도 곧바로 잠기지 않게.
  await clearWindow(key);
  check("지우면 0 으로 읽는다", await readWindow(key), 0);
  check("지운 자리는 다음 한 번이 1 이다", await hitWindow(key, WINDOW_MS), 1);

  await clearWindow(key);
}

/* ── 가입 요청: 토큰은 만들어진 뒤로 바뀌지 않는다 ────────────── */

console.log("\n가입 요청 토큰 불변식 (다른 브라우저가 가로챌 수 없다)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) throw new Error("시드 팀이 없습니다. 먼저 db:seed 를 돌리세요.");
  const suffix = String(Date.now() % 1e7);
  const name = `불변${suffix}`;

  const first = await db.joinRequest.create({
    data: { teamId: team.id, name, token: `A-${suffix}`, status: "pending" },
  });
  check("첫 신청이 그 토큰을 가진다", first.token, `A-${suffix}`);

  // 같은 이름으로 두 번째 신청 = 다른 브라우저가 재신청한 것.
  let code: string | undefined;
  try {
    await db.joinRequest.create({
      data: { teamId: team.id, name, token: `B-${suffix}`, status: "pending" },
    });
  } catch (error) {
    code = (error as { code?: string }).code;
  }
  check("같은 이름의 두 번째 신청은 DB 가 막는다", code, "P2002");

  const kept = await db.joinRequest.findUniqueOrThrow({
    where: { teamId_name: { teamId: team.id, name } },
  });
  check("토큰은 여전히 첫 번째 것", kept.token, `A-${suffix}`);
  check("이름당 요청은 하나뿐이다", await db.joinRequest.count({ where: { teamId: team.id, name } }), 1);

  await db.joinRequest.delete({ where: { id: first.id } });
}

console.log("\n가입 요청 토큰 불변식 (동시에 같은 이름으로 신청하면 한 명만 이긴다)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) throw new Error("시드 팀이 없습니다. 먼저 db:seed 를 돌리세요.");
  const suffix = String(Date.now() % 1e7);
  const name = `경쟁${suffix}`;

  const results = await Promise.allSettled([
    db.joinRequest.create({ data: { teamId: team.id, name, token: `A-${suffix}`, status: "pending" } }),
    db.joinRequest.create({ data: { teamId: team.id, name, token: `B-${suffix}`, status: "pending" } }),
  ]);

  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected");
  check("한쪽만 이긴다", won.length, 1);
  check("진 쪽은 둘 다 P2002 다", lost.every((r) => (r as PromiseRejectedResult).reason?.code === "P2002"), true);

  const row = await db.joinRequest.findUniqueOrThrow({
    where: { teamId_name: { teamId: team.id, name } },
  });
  check("남은 행의 토큰은 승자의 그것이다", row.token, (won[0] as PromiseFulfilledResult<{ token: string }>).value.token);

  await db.joinRequest.delete({ where: { id: row.id } });
}

console.log("\n초대 선택지 (서버가 다시 보는 값)");
{
  // **화면이 고른 값을 서버가 다시 본다.** 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수
  // 있으므로, 여기서 확인하지 않으면 "9999명"이나 "3650일"이 그대로 들어간다 — 그건 1회용의
  // 반대편이다(사실상 아무도 못 쓰는 초대, 혹은 사실상 영구 초대).
  check("인원은 1·2·3·5·10 만 받는다", [...USE_CHOICES], [1, 2, 3, 5, 10]);
  check("기한은 1·3·7·30 일만 받는다", [...EXPIRY_CHOICES], [1, 3, 7, 30]);
  check("0명은 없다", USE_CHOICES.includes(0 as never), false);
  check("음수는 없다", USE_CHOICES.includes(-1 as never), false);
  check("무한대는 없다", USE_CHOICES.includes(Infinity as never), false);
  // **0일 = "그 순간부터 닫힌다"** — 고를 수 있게 해서는 안 된다. 만료가 즉시라 실효상 폐기다.
  check("0일은 없다 (만료 즉시 닫히는 초대가 된다)", EXPIRY_CHOICES.includes(0 as never), false);
  // 액션이 이 규칙을 실제로 거르는지 — 상수만 맞아도 액션이 안 거르면 통과한다.
  const action = readCode("../src/server/actions/invite.ts");
  check("팀장 확인이 초대 발급보다 먼저 온다", action.indexOf("requireLeader()") < action.indexOf("createTeamInvite(leader.teamId"), true);
  check("화면 값을 서버가 다시 거른다", /!isUseChoice\(maxUses\)/.test(action) && /!isExpiryChoice\(days\)/.test(action), true);
  check("이름도 서버에서 자른다", /label\.length > INVITE_LABEL_MAX/.test(action), true);

  /**
   * **화면이 고르는 목록이 서버의 목록과 어긋나면 안 된다.** 서버가 조용히 값을 자르는
   * 경로라(위 주석), 화면에만 적힌 값이 생기면 "몇 명분" 을 눌렀는데 반영이 안 되는 것으로
   * 보인다 — 무엇이 틀렸는지 아무 화면에도 없다.
   *
   * `roster-screen.tsx` 이 `USE_CHOICES` 를 부르는지 소스로 본다. 상수만 맞아도 화면이 따로
   * 적어 두면 이 검사는 통과하므로, **화면 쪽을 봐야 한다.**
   */
  const roster = readCode("../src/features/roles/roster-screen.tsx");
  truthy("초대 화면은 USE_CHOICES 를 부른다", roster.includes("USE_CHOICES"));
  truthy("초대 화면은 EXPIRY_CHOICES 를 부른다", roster.includes("EXPIRY_CHOICES"));
  check("화면이 인원수를 다시 적지 않는다", /\[\s*"\d+"\s*,/.test(roster), false);
  // 기한은 값과 이름을 같이 적어 두기 쉬워서 따로 본다 — 위 검사는 둘을 함께 본다.
  check("화면이 기한 값을 다시 적지 않는다", /\[\s*"\d+"\s*,\s*"/.test(roster), false);
}

console.log("\n초대 토큰 (길이와 정규식이 같이 움직여야 한다)");
{
  /**
   * **상수와 정규식을 따로 적으면 조용히 어긋난다.** 길이를 44로 바꾸고 정규식만 43으로
   * 남으면 **정상 토큰을 버리는 문지기**가 된다. 이 필터는 해시하기 전에 버리는 비용 게이트라
   * (`auth/invite-token.ts` 의 주석) 어느 쪽으로 틀어도 예외 없이 "초대가 안 먹힌다" 만
   * 보인다 — 그래서 발급과 검증을 한 쌍으로 확인한다.
   */
  const token = newInviteToken();
  check("발급한 토큰은 자기 길이다", token.length, INVITE_TOKEN_LENGTH);
  truthy("발급한 토큰을 자기 검증기가 통과시킨다", looksLikeInviteToken(token));

  // 알파벳은 base64url 이고 `+` `/` `=` 가 없어야 쿼리 문자열에서 안 깨진다.
  check("알파벳이 base64url 이다", /^[A-Za-z0-9_-]+$/.test(token), true);

  // 한 글자라도 다르면 버린다 — 조각 맞춰 붙이는 값이 통과해서는 안 된다.
  check("한 글자 짧으면 버린다", looksLikeInviteToken(token.slice(0, -1)), false);
  check("한 글자 길면 버린다", looksLikeInviteToken(`${token}x`), false);
  check("공백이 섞이면 버린다", looksLikeInviteToken(`${token.slice(0, 5)} ${token.slice(6)}`), false);
  check("아무것도 안 오면 버린다", looksLikeInviteToken(""), false);
}

console.log("\n초대가 지금 들어오는 길을 열어 주는가");
{
  // 순수 판정이라 서버 액션 없이도 부를 수 있다(`rules.ts` 머리말).
  const now = 1_000_000_000;
  const fresh = { maxUses: null, useCount: 0, expiresAt: null, revokedAt: null };
  const at = (ms: number) => new Date(now + ms);

  check("처음 발급된 초대", isInviteUsable(fresh, now), true);
  check("되돌린 초대는 막는다", isInviteUsable({ ...fresh, revokedAt: at(-1) }, now), false);
  check("지난 시각은 막는다", isInviteUsable({ ...fresh, expiresAt: at(-1) }, now), false);
  check("아직 안 지난 시각은 열어 둔다", isInviteUsable({ ...fresh, expiresAt: at(1) }, now), true);
  // **경계는 닫힌 쪽이다.** "그 시각까지 유효" 가 아니라 "그 시각부터 무효" — 정확히 그
  // 순간에 도착한 사람이 행운에 따라 들어갈 수 없게 하지 않는다.
  check("만료 시각과 같은 순간은 이미 막힌다", isInviteUsable({ ...fresh, expiresAt: at(0) }, now), false);
  // 경계의 양옆 — 만료 1ms 뒤는 아직 열려 있고, 그 순간부터 닫힌다.
  check("만료 1ms 뒤는 아직 열려 있다", isInviteUsable({ ...fresh, expiresAt: new Date(now + 1) }, now), true);
  check("만료 1ms 전은 이미 닫혔다", isInviteUsable({ ...fresh, expiresAt: new Date(now - 1) }, now), false);

  // **자리는 승인 횟수로 찬다.** 거절과 취소를 세지 않는다는 약속이 여기서 성립한다.
  check("1회용에 아무도 안 왔으면 열려 있다", isInviteUsable({ ...fresh, maxUses: 1, useCount: 0 }, now), true);
  check("1회용의 자리를 썼으면 닫힌다", isInviteUsable({ ...fresh, maxUses: 1, useCount: 1 }, now), false);
  check("초과해서도 닫혀 있다", isInviteUsable({ ...fresh, maxUses: 1, useCount: 2 }, now), false);
  check("3회용은 두 명까지 열린다", isInviteUsable({ ...fresh, maxUses: 3, useCount: 2 }, now), true);
  // 무제한은 숫자 제한을 두지 않는다 — 0 과 구분된다.
  check("maxUses 가 null 이면 무제한이다", isInviteUsable({ ...fresh, maxUses: null, useCount: 999 }, now), true);
  // 세 조건 중 하나만 있어도 막는다.
  check("셋 중 하나만 있어도 막는다", isInviteUsable({ maxUses: 1, useCount: 1, expiresAt: at(1), revokedAt: null }, now), false);
}

console.log("\n입장 해석: 초대가 팀 정보를 지어내지 않는다");
{
  // 01 화면은 "초대받은 팀" 카드에서 사람 수와 마감일을 그대로 그린다. 초대가 그 값을
  // 세어 오지 않으면, 팀이 비어 있지 않아도 **"0명"** 으로 보인다 — 코드 길과 같은 정보를
  // 두 길이 다르게 보여 주는 셈이라 화면이 스스로를 모순한다.
  const joinPage = readCode("../src/app/join/page.tsx");
  check("초대 길이 사람 수를 지어내지 않는다", /memberCount: 0/.test(joinPage), false);
  check("초대가 센 사람 수를 그대로 쓴다", /memberCount: fromLink\.memberCount/.test(joinPage), true);
  check("마감일도 초대가 가져온 값을 쓴다", /dday: fromLink\.teamDday/.test(joinPage), true);

  // `?t=` 는 **명시적인 권한 증명**이다. 실패했을 때 조용히 `Team.code` 길로 넘어가면
  // 되돌린 초대가 그 사실조차 숨긴다(`resolve-target.ts` 머리말).
  const target = readCode("../src/server/invite/resolve-target.ts");
  const tokenBranch = target.slice(
    target.indexOf("if (token)"),
    target.indexOf("const code = input.code"),
  );
  check("토큰이 있으면 그 길로만 판정한다", tokenBranch.includes("return null"), true);
  check("토큰 분기에 코드 길로 넘어가지 않는다", tokenBranch.includes("input.code"), false);
  // 초대를 세는 쿼리는 **관여자** 기준이다 — 나간 사람의 행은 기록을 위해 남는다.
  check("초대가 세는 것도 나간 사람을 뺀다", /members: \{ where: ACTIVE \}/.test(target), true);
}

console.log("\n가입 요청: 막는 위치와 덮어쓰지 않음이 코드에 남아 있다");
{
  // 순수 함수를 부를 수 없는 지점(쿠키가 필요한 액션)은 **소스**로 고정한다. 이 저장소는
  // 이미 화면·서버가 같은 계산을 쓰는 관례로 그랬다.
  const src = readCode("../src/server/actions/onboarding.ts");
  const from = src.indexOf("export async function joinTeam");
  const fn = src.slice(from, src.indexOf("export async function checkJoinApproval", from));

  // **`upsert` 는 토큰 회전의 유일한 경로였다.** update 에 `token` 이 들어가면 다른
  // 브라우저가 그 토큰을 자기 쿠키로 옮겨 심는다. create 로만 만들어야 이게 불가능하다.
  check("토큰을 갱신하는 upsert 가 없다", /joinRequest\.upsert/.test(fn), false);
  check("새 요청은 create 로만 만든다", /joinRequest\.create/.test(fn), true);
  check("경합에서 진 쪽은 덮어쓰지 않고 돌려보낸다", /P2002[\s\S]{0,160}status: "taken"/.test(fn), true);
  // 제한은 **행도 알림도 만들어지기 전에** —— 알림 폭탄의 비용이 이미 발생한 뒤에 막으면 늦다.
  check("이 브라우저 제한이 요청 생성보다 먼저 온다", fn.indexOf("takeClientAttempt") < fn.indexOf("joinRequest.create"), true);
  // 소유자만 자기 요청을 고친다. 남의 희망 역할을 덮어쓰면 역할 추첨의 입력이 바뀐다.
  check("소유자 확인이 새 요청보다 먼저 온다", fn.indexOf("store.get(JOIN_COOKIE)?.value;\n    const found") >= 0, true);
  // **팀 예산은 새 행을 만들려는 시점에만 깎인다.** 위쪽에 두면 자기 요청을 다시 여는
  // 정상 사용자가 팀 예산을 먹고, 그 숫자를 공격자가 고쳐 팀 전체의 신규 가입을 막는다.
  // 팀 코드 하나만 알면 이 숫자를 조작할 수 있으므로 순서가 곧 방어다.
  check(
    "팀 예산은 소유자 확인 뒤에 온다",
    fn.indexOf("takeTeamCreation") > fn.indexOf("const found = await db.joinRequest.findUnique"),
    true,
  );
  check("팀 예산은 요청 생성보다 먼저 온다", fn.indexOf("takeTeamCreation") < fn.indexOf("joinRequest.create"), true);

  // 푸시는 예산 안에서만, 앱 안 알림은 항상.
  const notifySrc = readCode("../src/server/notify/create.ts");
  // 여기서 고이는 **문구가 아니라 보장**이다. 예전은 `input.push === false` 라는 문자열을
  // 찾았고, 구현이 `input.push ?? pushPolicy(...)` 로 다듬어지면서 **검사는 깨졌는데 아무
  // 것도 고장나지 않았다**(2026-09-28). 그래서 말을 고정하지 않는다 —
  //
  // ① 호출부가 `push` 를 명시하면 그것이 되고, 아니라면 정책이 정한다.
  // ② **앱 안 알림은 푸시 판정보다 먼저 쌓인다.** 순서가 바뀌면 푸시 예산이 모자란 날
  //    알림함까지 비어 있게 된다 — 그게 이 자리의 존재 이유다.
  check(
    "notify 가 푸시만 끌 수 있다 (명시하면 따르고, 아니면 정책이 정한다)",
    /input\.push\b/.test(notifySrc) && /pushPolicy\(/.test(notifySrc),
    true,
  );
  check(
    "앱 안 알림은 푸시 예산과 무관하게 남는다",
    notifySrc.indexOf("notification.createMany") > -1 &&
      notifySrc.indexOf("notification.createMany") < notifySrc.indexOf("pushPolicy("),
    true,
  );
}

await finish();
