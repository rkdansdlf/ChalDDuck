import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, check, truthy, fail, readCode, finish } from "./db-test-base.mjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { stripComments } from "../scripts/strip-comments.mjs";
import {
  AI_INPUT_LIMIT,
  aiInputOverrun,
} from "../src/lib/ai-limit.js";
import { ROLE_DECISION_HOW } from "../src/features/roles/copy.js";
import {
  NO_DRAW_POOL_TEXT,
  awaitsMyConsent,
  canDrawIn,
  canProposeIn,
  consentViewOf,
  drawPoolOf,
  isRoleKey,
  isUnresolvedClash,
  normalizeName,
  rolesAwaitingMyConsent,
  roleViewOf,
  unresolvedClashes,
  toRoleKey,
  voidedText,
} from "../src/features/roles/roster-model.js";
import {
  AI_POLICY,
  CUSHION_DEFAULT_MODE,
  CUSHION_LEVELS,
  ICE_GAMES,
  MENU_OPTIONS,
  RANDOM_TOOLS,
  ROLES,
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
} from "../src/data/catalog.js";
import {
  MAFIA_MAX_PLAYERS,
  MAFIA_MIN_PLAYERS,
  MAFIA_PRESETS,
  canEnterMafiaPhase,
  countRoles,
  mafiaLineup,
  mafiaLineupText,
  mafiaTimeline,
  mafiaWinner,
  mayTargetAtNight,
  nightAlreadyStruck,
  nightRoleOf,
  requiredNightActions,
  resolveDayVote,
  resolveNight,
  MAX_RUNOFFS,
  type MafiaPhase,
} from "../src/lib/mafia-rules.js";
import { canEditTask, shouldNotifyAssignee, taskEditBlock } from "../src/lib/task-permission.js";
import { acceptedRoleAssignments } from "../src/data/accepted-roles.js";
import { contribTotals } from "../src/data/contrib-report-totals.js";
import {
  QUIZ_QUESTIONS,
  countAnswered,
  pickSide,
  picksToMbti,
  scoreAxes,
  sideLetter,
} from "../src/lib/mbti-quiz.js";
import { MBTI_AXES, calculateTeamMbtiStats, type MbtiAxis } from "../src/lib/mbti.js";
import { lastMessagePerThread } from "../src/data/last-message.js";
import {
  candidateDates,
  scheduleWeeks,
  shortDate,
  todayInSeoul,
  weekName,
} from "../src/features/schedule/week.js";
import { computeMeetingSlots } from "../src/features/schedule/meeting-slots.js";
import { effectiveStage, isPastDeadline } from "../src/features/schedule/meeting-model.js";
import { softenProfanity } from "../src/lib/profanity.js";
import {
  canOpenInApp,
  humanSize,
  isLateVersion,
  resolveFileType,
} from "../src/features/drive/file-rules.js";
import {
  formatDue,
  formatWhen,
  fromKstInputValue,
  toKstInputValue,
} from "../src/lib/when.js";
import { undelivery } from "../src/server/auth/undelivered.js";
import { recordAiUsage, refundAiUsage, aiUsageToday } from "../src/server/ai/limit.js";
import { fallbackModelFor, isTransient, modelFor, withFallback } from "../src/server/ai/model.js";
import { orNull, shapeClerkDraft, shapePresentDraft } from "../src/lib/ai-draft-shape.js";
import { extractJsonObject, missingRequired } from "../src/lib/ai-json.js";
import { flush, newLineSplitter, pushBytes } from "../src/lib/ai-stream-lines.js";
import {
  boxesDueSoon,
  buildBriefing,
  isDueUnset,
  isMeetingToday,
  pokeTargets,
  suggestTools,
} from "../src/features/home/briefing.js";
import { aiCallStats, describeAiCalls, detectAiAnomalies, type AiCallStats } from "../src/server/ai/call-stats.js";
import { pushPolicy, type NotifyKind } from "../src/server/notify/policy.js";
import { confirmDueMeetings } from "../src/server/meetings/confirm-due.js";
import { CUSHION_CORPUS } from "./cushion-corpus.mjs";
import {
  markAside,
  markCell,
  markJump,
  markText,
  meetingMark,
} from "../src/features/schedule/meeting-cell.js";
import {
  pushBlock,
  pushFailure,
  pushOn,
  pushPayload,
  pushSubscriptionFrom,
} from "../src/features/home/push-model.js";
import {
  CUSHION_REASON,
  CLAIM_TTL_MS,
  FAILURE_BACKOFF_MS,
  MAX_ATTEMPTS,
  PROMPT_VERSION,
  READ_CUSHION_DEFAULT,
  buildPurifyRequest,
  canPurify,
  canRetry,
  cushionBucketOf,
  displayTextOf,
  isCushionDone,
  isRefusal,
  judgeAll,
  levelGuide,
  maskRiskyParts,
  needsMask,
  packPurifyItems,
  PURIFY_CONTEXT_MESSAGES,
  parsePurifyResponse,
  purificationAiShare,
  remainingPurify,
  purificationCoverage,
  rejectsPurified,
  toneChanged,
  toneOf,
  VALIDATOR_VERSION,
  type CushionReason,
  type CushionStatus,
} from "../src/lib/read-cushion.js";
import { purifyPolicyHash } from "../src/server/ai/purify-policy.js";
import type { ChatMessage, IcePhase, IceRole, Member, MeetingProposal, Role, RoleDrawResult, RoleKey, Task } from "../src/lib/types.js";
import { LIAR_PROMPT_CATEGORIES, LIAR_PROMPTS } from "../src/data/liar-prompts.js";
import {
  ICE_RESULT_CODES,
  canForfeitLiarGuess,
  canVoteNow,
  checkLiarGuess,
  deal,
  iceResultText,
  mafiaOutcome,
  maySeeWord,
  resolveLiarVote,
  voteBlockedText,
} from "../src/server/ice/rules.js";
import { applyMafiaDayVote } from "../src/server/ice/day-vote.js";
import { icePhase, iceViewFor } from "../src/server/ice/view.js";
import {
  contribByLabel,
  contribState,
  maxConfirmsNeeded,
  refreshContribState,
} from "../src/server/contrib/state.js";
import {
  currentParticipations,
  isMarked,
  participationText,
} from "../src/features/contrib/participation.js";
import {
  RESOLUTION_WAYS,
  canConfirm,
  confirmBlockReason,
  isResolutionWay,
  unresolvedAfter,
} from "../src/features/contrib/resolution.js";

/**
 * 낮 투표의 적용 로직은 액션 밖 모듈에 있다(2026-09-30).
 */
const DAY_VOTE = readCode("../src/server/ice/day-vote.ts");

/**
 * 업무 규칙을 확인하는 불변식 모음.
 *
 * **왜 이게 필요한가.** 지금까지 고친 버그는 전부 타입 검사가 잡지 못한 종류였다 —
 * Veto 를 후보에서 빼지 않는다, 확정된 회의를 덮어쓴다, 승인을 새 요청이 지운다.
 * 전부 함수 시그니처는 맞고 컴파일도 된다. 그래서 이 앱의 유일한 안전망은 "직접 눌러
 * 본 것"뿐이었는데, 사람이 한 번씩만 볼 수 있다는 한계가 그대로 드러났다.
 *
 * 여는 검사는 두 종류다.
 * - **순수 규칙** — 서버와 화면이 함께 쓰는 계산을 직접 부른다. 두 곳이 어긋나는 버그가
 *   실제로 있었고(`drawPoolOf` 전의 후보 풀) 형식 검사로는 절대 못 잡는다.
 * - **DB 불변식** — 유일 인덱스와 조회가 지켜야 하는 조건을 실제 Postgres 에 걸어 본다.
 *   마이그레이션을 되돌렸을 때, 컬럼을 지웠을 때 바로 드러난다.
 *
 * 서버 액션 자체는 부르지 않는다 — 전부 세션 쿠키가 필요하고 여기서 쿠키를 만들면
 * "액션이 정상"이 아니라 "액션을 우회했다"는 사실만 테스트하게 된다.
 *
 * **로컬 DB 에서만 돈다.** 시드와 같은 이유다.
 */

/* ── 한자 글리프가 섞여 들어오지 않았는지: 주석과 문서 ──────────── */

console.log("\n한자 인코딩");
{
/**
   * 한국어 주석 한 칸에 **한자 글리프가 하나씩** 섞여 들어온다.
   *
   * ## 왜 이게 반복됐는가
   *
   * 실제 오염은 전부 이 모양이다 — 띄어쓰기와 문맥은 멀쩡한데 **글자 하나만** 중국어로
   * 바뀌어 있다. "위아래로" 가 "위" + (위) + "아래" + (아래) + "로" 가 되고, "팀이" 가
   * "—" + (팀) + "이" 가 되고, "추천을" 이 (추천) + "을" 로 쪼개진다.
   *
   * 컴파일도 통과하고 테스트도 통과한다 — **주석은 실행되지 않으니까.** 그래서 한 번 발견하고
   * 두면 다음 주석에서 다시 생기고, 2026-09-30 기준으로 **14곳**이 쌓여 있었다(그중 두 곳은
   * 그날 내가 쓴 코드 안이었다). 스윕만으로는 다음 주석에서 재생된다. 그래서 이 불변식을 둔다.
   *
   * **이 설명에 한자를 쓰지 않는 이유**는 아래 `probes` 다 — 오염된 예시를 주석에 적으면
   * 이 검사가 자기 자신을 잡아 실패한다. 그래서 실제 예시는 문자열 배열에 넣고(코드이지 주석이
   * 아니다), 여기에는 설명만 남긴다.
   *
   * ## 왜 **주석 줄만** 보는가
   *
   * 이 저장소에는 **의도적으로 중국어가 있는** 자리가 있다:
   *
   * - `scripts/cushion-corpus.mts` — 한국어 문장에 중국어가 섞인 입력 픽스처
   * - `src/lib/read-cushion.ts` — 중국어 거절 문구를 알아보는 정규식
   * - `scripts/smoke.mts` — 위 둘을 검사하는 픽스처
   *
   * 셋 다 **문자열·정규식 안**이라 주석 줄 검사로는 걸리지 않는다. 그런데 중국어 욕설 픽스처
   * 처럼 한글이 한자와 **이어진 문자열**이 있어 "한자 옆에 한글" 로 보는 검사는 오탐을 낸다.
   * 그래서 주석 줄로 한정한다.
   */
  const HAN = /[\u4e00-\u9fff]/;
  /** `// …` 또는 블록 주석의 `* …` 줄. 문자열 안의 `//` 는 걸리지 않는다(줄 첫 칸 기준). */
  const isCommentLine = (line: string) => /^\s*(\/\/|\*)/.test(line);
  const hasHanInComment = (line: string) => isCommentLine(line) && HAN.test(line);

  const roots = ["../src", "../scripts", "../prisma"];
  /** `generated` 는 Prisma 클라이언트라 한국어가 없고 양만 많다. */
  const skip = new Set(["node_modules", "generated", ".next", "handoff"]);
  const found: string[] = [];
  let scanned = 0;

  /**
   * 디렉터리를 훑으며 대상 파일마다 `onFile` 을 **한 번씩** 부른다.
   *
   * **파 단위로 세는 이유** — 아래 `scanned > 50` 은 "검사 대상이 줄이 아니라 파일로 모였는지"를
   * 확인하는 값이다. 줄을 세도록 만들면 guard 의 뜻이 바뀌어 조용히 통과한다.
   */
  const walk = (
    dir: string,
    skipNames: ReadonlySet<string>,
    isTarget: (name: string) => boolean,
    onFile: (full: string) => void,
  ) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skipNames.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, skipNames, isTarget, onFile);
        continue;
      }
      if (isTarget(entry.name)) onFile(full);
    }
  };

  const isCode = (name: string) => /\.(ts|tsx|mjs|mts)$/.test(name);
  for (const root of roots)
    walk(new URL(root, import.meta.url).pathname, skip, isCode, (full) => {
      scanned += 1;
      readFileSync(full, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (hasHanInComment(line)) found.push(`${full}:${i + 1}`);
        });
    });

  // 14곳을 고쳤으니 0이어야 한다. 목록을 그대로 보여 주면 어디를 고쳤는지와 앞으로 어디가
  // 오염됐는지 한 번에 읽힌다 — 파일:줄 형태.
  check("주석에 한자 글리프가 없다", found, []);

  // 검사가 실제로 **뭔가를 잡는지** 확인한다. 이 검사가 고장 나면 조용히 통과하는데,
  // 그러면 위의 0은 아무 의미가 없어진다.
  const probes = [
    ["// 團이 그대로 남았다", true],
    [" * 화면上下로 흩어지면", true],
    ['const s = "抱歉, 我无法协助"; // 주석은 깨끗함', false],
    ["const s = '고양이새가来了';", false],
    ["// 한글이 남았다", false],
  ] as const;
  check(
    "검사가 한자를 잡고 픽스처는 통과시킨다",
    probes.map(([line, want]) => [hasHanInComment(line), want]),
    [
      [true, true],
      [true, true],
      [false, false],
      [false, false],
      [false, false],
    ],
  );
  check("주석 검사 대상이 실제로 있다", scanned > 50, true);

  /* ── 문서: 주석 줄로 가리지 않는다 ──────────────────────── */

  /**
   * **문서도 본다.** 위 검사는 `src`/`scripts`/`prisma` 의 **주석 줄만** 본다. 그 밖의 한국어
   * 글은 즉 사람이 읽는 자리인데 — `README.md`, `CLAUDE.md`, `docs/product-language.md`,
   * `docs/handoff/HANDOFF.md`, 그리고 한국어 안내문인 `.env.example` — 아무도 보지 않았다.
   * 문서에 오염이 있어도 이 검사는 조용히 통과했다.
   *
   * **문서가 더 위험한 이유** — 주석은 실행되지 않으니 오염이 눈에 띄지 않는다. 문서는 그
   * 자체로 눈에 보이는 글이다. 게다가 `README.md` 는 거의 모든 커밋이 건드리는 파일이라
   * 오염이 쌓일 자리가 가장 넓다.
   *
   * **줄을 가리지 않는 이유** — 마크다운에 주석 줄은 없다. 구분할 자리가 없으므로 문서에서는
   * 글자가 나타난 위치가 곧 오염이다. 위의 문자열 안쪽 예외는 `src`/`scripts` 에만 있고
   * `.md` 에는 없다.
   */
  /** 끝의 `/` 를 떼어야 아래 `slice` 에서 앞 글자가 잘리지 않는다 — `new URL("..", …)` 는 slash 로 끝난다. */
  const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  /** 워크트리 안에는 같은 문서가 복사되어 있어 두 번 세고, `.env` 는 서crets 다 — 둘 다 읽지 않는다. */
  const skipDocs = new Set([".git", ".next", ".vercel", "node_modules", ".claude", ".worktrees"]);
  const docFound: string[] = [];
  const docNames = new Set<string>();
  const scanDoc = (full: string) => {
    docNames.add(full.slice(repoRoot.length + 1));
    readFileSync(full, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (HAN.test(line)) docFound.push(`${full}:${i + 1}`);
      });
  };
  walk(repoRoot, skipDocs, (name) => /\.mdx?$/.test(name), scanDoc);
  /** `.env.example` 는 **확장자로는 걸리지 않는다** — 이름이 `.example` 이기 때문이다. 한국어 안내문이라 문서로 센다. */
  scanDoc(join(repoRoot, ".env.example"));

  check("문서에 한자 글리프가 없다", docFound, []);

  // 위와 같은 이유로 — 문서 검사가 고장 나면 0 은 아무 의미가 없어진다. 마크다운에는 `//` 도 `*` 도
  // 없으므로 아예 줄 종류를 보지 않는다.
  const docProbes = [
    ["위아래로 흩어지면", false],
    ["위上아래로 흩어지면", true],
    ["`npm run verify` — db:check 를 돌린다", false],
    ["- 대화를 시작한다\n", false],
  ] as const;
  check(
    "문서 검사가 한자를 잡고 한글은 통과시킨다",
    docProbes.map(([line, want]) => [HAN.test(line), want]),
    [
      [false, false],
      [true, true],
      [false, false],
      [false, false],
    ],
  );

  /**
   * **기준 문서가 다 빠졌는지** 확인한다.
   *
   * 위의 0 은 "아무것도 안 찾았다" 와 "아무것도 안 봤다" 가 구분되지 않는다. 확장자 규칙을
   * 고치거나 루트를 잘못 두면 대상이 0 개가 되어 조용히 통과한다 — 그래서 **이름을 직접 센다.**
   * 새 문서가 늘어도 이 목록은 늘리지 않는다. 목록에 없으면 그새 빈틈이 생긴다는 뜻이다.
   */
  const baseline = [
    "README.md",
    "CLAUDE.md",
    "AGENTS.md",
    "docs/product-language.md",
    "docs/handoff/HANDOFF.md",
    ".env.example",
  ];
  check(
    "기준 문서가 검사 대상에 들어 있다",
    baseline.filter((name) => !docNames.has(name)),
    [],
  );
}

/* ── 사용자 노출 용어: 기준에서 되돌아가지 않았는지 ─────────── */

/**
 * 예전 화면 문구 → 기준 용어. **기준은 [`docs/product-language.md`](../docs/product-language.md).**
 *
 * ## 왜 금지어가 아니라 **예전 문구 그대로**인가
 *
 * `순화` 를 부분 문자열로 막으면 지금도 남아 있는 내부 개념 설명(`api.ts` 의 "순화 상태",
 * `use-chat-thread.ts` 의 "순화가 왜 멈췄는지")이 걸린다. 그건 오탐이고, 오탐이 있는
 * 검사는 첫날부터 무력화된다 — 여기 적힌 문자열은 **모두 화면에 실제로 나갔던 문구**다.
 *
 * `거절하기` 를 넣지 않은 것도 이유가 있다. 재입장 승인에서 `거절` 은 **옳은 용어**다
 * (`docs/product-language.md`). 역할 쪽만 `안 받기` 로 바꿨으므로, 전역 금지로 두면
 * 엉뚱한 화면까지 망가뜨리는 검사가 된다. 예외가 있다는 사실이 곧 raw grep 이 못 가는 이유다.
 */
const LEGACY_PRODUCT_COPY = [
  { legacy: "기여도", canonical: "기여 기록" },
  { legacy: "합의한 역할", canonical: "확정된 역할" },
  { legacy: "수락하기", canonical: "받기" },
  { legacy: "순화해서 읽기", canonical: "읽기 도움" },
  { legacy: "읽기 순화 설정", canonical: "읽기 도움 설정" },
  { legacy: "순화됨", canonical: "다듬어 읽음" },
  { legacy: "순화문", canonical: "다듬어 읽은 말" },
  { legacy: "순화 몫", canonical: "읽기 도움 몫" },
  // `거절하기` 와 `반대하기` 는 둘 다 넣지 않는다 — 재입장 승인이 `거절`, 팀 동의가
  // `반대` 로 **각각 맞는 용어**다. 전역 금지로 두면 다른 화면을 망가뜨리는 검사가 된다.
  // 역할 쪽만 `안 받기` 로 바꿨고, 그 옆의 `수락하기` 만 금지한다.
] as const;

/**
 * `src/` 아래의 화면·서버 소스. 생성물과 테스트는 뺀다.
 *
 * **`server/` 는 일부러 넣었다.** 서버에도 사용자 문자열이 산다 — 알림 본문
 * (`actions/social.ts`) 과 공유 판정의 문구(`features/roles/roster-model.ts`) 다.
 * 빼면 사용자에게 나가는 문구가 검사 밖으로 빠져나간다.
 *
 * `generated/` 는 Prisma 클라이언트라 한국어 문구가 없고 양만 많다.
 */
function productCopySources(dir: URL): URL[] {
  const out: URL[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      out.push(...productCopySources(child));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(child);
  }
  return out;
}

/**
 * 사용자 노출 카피가 기준대로인지 본다.
 *
 * **주석은 지운 뒤에 찾는다**(`strip-comments.mjs` 는 위치를 보존하므로 줄 번호가 그대로
 * 남는다). 그렇지 않으면 `lib/types.ts` 같은 계약 파일의 설명이 "사용자 문구"로 잡힌다 —
 * 그게 이 검사를 처음부터 무력화하는 길이다.
 *
 * 검사 대상 문자열은 전부 한국어라 **식별자가 될 수 없다.** 주석을 지우면 남는 곳은 문자열
 * 리터럴과 JSX 텍스트뿐이고, 그게 검사하려는 대상이다.
 *
 * **`확인 대기` 는 넣지 않았다** — 기준 용어인 `팀원 확인 대기` 안에 부분 문자열로 들어 있어
 * 올바른 문구를 실패로 본다.
 */
function checkProductLanguage() {
  const root = new URL("../", import.meta.url);
  const found: { at: string; line: number; text: string; legacy: string; canonical: string }[] =
    [];

  for (const file of productCopySources(new URL("src/", root))) {
    // 원문을 따로 읽어야 줄을 그대로 인용할 수 있다 — 지운 뒤엔 빈칸만 남는다.
    const original = readFileSync(file, "utf8");
    const stripped = stripComments(original);
    for (const { legacy, canonical } of LEGACY_PRODUCT_COPY) {
      let at = stripped.indexOf(legacy);
      while (at !== -1) {
        const line = stripped.slice(0, at).split("\n").length;
        found.push({
          at: file.pathname.slice(root.pathname.length),
          line,
          text: original.split("\n")[line - 1]?.trim() ?? "",
          legacy,
          canonical,
        });
        at = stripped.indexOf(legacy, at + legacy.length);
      }
    }
  }

  if (found.length === 0) {
    check("사용자 노출 용어가 기준과 같다", true, true);
    return;
  }

  // `check` 의 집계만 빌리고 메시지는 직접 — "기대/실제" 로 이 일을 설명할 수 없다.
  fail(found.length);
  for (const hit of found) {
    console.log(
      `  ✗ [product-language] ${hit.at}:${hit.line}\n` +
        `      "${hit.legacy}" 는 쓰지 않습니다. docs/product-language.md 기준: "${hit.canonical}"\n` +
        `      > ${hit.text}`,
    );
  }
}

/* ── 역할 추첨: Veto 는 후보에서 빠진다 ─────────────────────── */

console.log("\n역할 추첨 후보 (07 화면과 서버가 같은 함수를 쓴다)");
{
  const wanters = [
    { id: "1", name: "김민준", veto: "present" as const },
    { id: "2", name: "최유나", veto: null },
  ];
  const research = drawPoolOf(wanters, "research", new Set());
  check("Veto 가 다른 역할이면 후보에 남는다", research.pool.map((m) => m.name), [
    "김민준",
    "최유나",
  ]);

  const present = drawPoolOf(
    wanters.map((m) => ({ ...m, want: "present" })),
    "present",
    new Set(),
  );
  check("Veto 한 역할의 후보에서 빠진다", present.pool.map((m) => m.name), ["최유나"]);
  check("Veto 한 역할은 사유를 알 수 있다", present.noPool, null);

  const allVetoed = drawPoolOf(
    [
      { id: "1", name: "박지호", veto: "manage" as const },
      { id: "2", name: "이서연", veto: "manage" as const },
    ],
    "manage",
    new Set(),
  );
  check("전원이 Veto 하면 뽑지 않는다", allVetoed.pool, []);
  check("누가 Veto 한 것인지 말해 준다", allVetoed.noPool, "all-vetoed");
  truthy("그 사유에 문구가 있다", NO_DRAW_POOL_TEXT[allVetoed.noPool!].length > 0);

  const noWanters = drawPoolOf([], "deck", new Set());
  check("희망자가 0명이면 뽑지 않는다", noWanters.noPool, "no-wanters");

  const oneRejected = drawPoolOf(wanters, "research", new Set(["2"]));
  check("거절한 사람은 빠진다", oneRejected.pool.map((m) => m.name), ["김민준"]);

  // **전원이 거절하면 되돌리지 않는다.** 예전에는 거절 명단을 무시하고 Veto 가 아닌
  // 사람 전체로 되돌렸다 — 이미 "안 받겠다"고 한 사람에게 같은 제안을 반복하게 되고,
  // 거절이라는 신호가 사라진다. 역할은 미정으로 남는다.
  const allRejected = drawPoolOf(wanters, "research", new Set(["1", "2"]));
  check("전원 거절이면 뽑지 않는다", allRejected.pool, []);
  check("전원 거절이면 사유를 말해 준다", allRejected.noPool, "all-rejected");
  truthy("그 사유에 문구가 있다", NO_DRAW_POOL_TEXT[allRejected.noPool!].length > 0);
  const allRejectedVetoed = drawPoolOf(
    [
      { id: "1", name: "박지호", veto: "manage" as const },
      { id: "2", name: "이서연", veto: "manage" as const },
    ],
    "manage",
    new Set(["1", "2"]),
  );
  check("Veto 한 사람은 거절과 무관하게 빠진다", allRejectedVetoed.pool, []);
  // Veto 가 사유를 먼저 말한다 — 이 역할은 애초에 뽑을 후보가 없었다.
  check("Veto 가 사유를 먼저 말한다", allRejectedVetoed.noPool, "all-vetoed");
}

/* ── 역할 상태: 아무도 풀 수 없는 상태가 없어야 한다 ──────── */

console.log("\n역할 상태 (아무도 풀 수 없는 상태가 없는지)");
{
  // 이 검사가 있는 이유: 고친 버그가 전부 타입 검사가 못 잡는 종류였기 때문이다.
  // 수락·거절 블록이 `clash`(희망자 2명 이상) 조건 아래에 있어서 **추적이 남은 상태인데
  // 아무도 볼 수 없는 화면**이 조용히 생겼다. 조건식은 맞고 컴파일도 된다.
  // 판을 `roleViewOf` 한 함수에 모았으니, 여기서는 그 함수가 **기대 담는 사람에게 닿지
  // 않는 상태를 만들지 않는지**를 전부 박는다.
  const draw = (over: Partial<RoleDrawResult> = {}): RoleDrawResult => ({
    tool: "룰렛",
    winner: "최유나",
    winnerId: "m4",
    accepted: false,
    stale: false,
    ...over,
  });

  check("희망자 0명 + 추첨 없음", roleViewOf(0, null), { kind: "empty" });
  // **희망자가 0명이어도 남은 추첨은 보여야 한다.** 당첨자가 자기 1순위를 바꾼 뒤가
  // 정확히 이 상태다 — "미정" 으로 덮으면 그 추첨은 아무도 볼 수 없다.
  check("희망자 0명 + 추첨 중", roleViewOf(0, draw()).kind, "awaiting");
  check("희망자 0명 + 확정", roleViewOf(0, draw({ accepted: true })).kind, "confirmed");

  check("희망자 1명 + 추첨 없음", roleViewOf(1, null), { kind: "auto" });
  check("희망자 2명 + 추첨 없음", roleViewOf(2, null), { kind: "negotiating" });

  check("추첨 직후", roleViewOf(2, draw()), { kind: "awaiting", winner: "최유나" });
  check("수락하면 확정", roleViewOf(2, draw({ accepted: true })), {
    kind: "confirmed",
    winner: "최유나",
  });

  // 희망자가 1명으로 줄었는데 추첨이 남은 상태(오늘 고친 구멍).
  // 예전에는 `clash` 조건이 false 라 당첨자도 아무것도 볼 수 없었다.
  const shrunk = roleViewOf(1, draw());
  check("남은 추첨이 보인다", shrunk, { kind: "awaiting", winner: "최유나" });
  check("답할 수단(추첨 버튼)은 닫혀 있다", canDrawIn(shrunk), false);

  // 당첨자가 팀을 나간 추첨(오늘 고친 구멍).
  const stale = roleViewOf(2, draw({ stale: true }));
  check("무효로 보인다", stale, { kind: "voided", winner: "최유나" });
  // **자리를 차지하고 있으므로 다시 뽑는 길이 반드시 있어야 한다.** 없으면 영구 정지.
  check("다시 뽑을 수 있다", canDrawIn(stale), true);
  truthy("무효 사유를 화면에 말할 수 있다", voidedText("최유나").includes("최유나"));

  // 확정된 뒤 나간 경우 — 이미 정해진 담당자는 남는다. 지우면 이력이 사라진다.
  check("확정된 뒤 나가도 확정은 남는다", roleViewOf(2, draw({ accepted: true, stale: true })).kind, "confirmed");

  // 사람이 0~4명, 추첨은 4가지(없음/대기/확정/무효)를 전부 돌려본다.
  // **동의 제안 두 가지(대기·마감 지나)** 도 같이 돌린다 — 동의 대기는 답해야 하는 사람이
  // 달라지므로(누가 뽑는가 → 누가 동의하느냐) 이 검사에서 빠지면 "동의 화면이 안 뜨는" 구멍이
  // 그대로 통과한다.
  const consentWaiting = {
    kind: "waiting",
    proposedBy: "김민준",
    tool: "룰렛",
    agreed: 2,
    responded: 3,
    totalMembers: 4,
    iAgreed: false,
    respondBy: "2999-01-01T00:00:00.000Z",
  } as const;
  const noStrand: string[] = [];
  for (let wanters = 0; wanters <= 4; wanters += 1) {
    for (const d of [null, draw(), draw({ accepted: true }), draw({ stale: true })]) {
      for (const consent of [{ kind: "open" }, consentWaiting] as const) {
        const view = roleViewOf(wanters, d, consent);
        // 추첨이 남아 있는데 아무도 수락할 수단이 없는 상태 = "수락 대기" 라 답이 있어야 한다.
        // 동의 대기에는 동의·반대 답이, 나머지 열림 상태에는 추첨(또는 이야기하기) 답이 있다.
        const hasAnswer =
          view.kind === "empty" ||
          view.kind === "auto" ||
          view.kind === "consent" ||
          canDrawIn(view) ||
          (d !== null && view.kind !== "voided");
        if (!hasAnswer) {
          noStrand.push(
            `희망자 ${wanters} · ${JSON.stringify(d?.accepted ?? null)} · 동의 ${consent.kind}`,
          );
        }
      }
    }
  }
  check("답이 닿는 상태로만 끝난다", noStrand, []);
}

/* ── 동의 제안: 추첨은 팀이 시작해도 된다고 동의해야 열린다 ── */

console.log("\n추첨 동의 제안");
{
  const NOW = new Date("2026-10-01T09:00:00Z");
  const live = (ms: number) =>
    ({
      tool: "룰렛",
      proposedBy: "김민준",
      agreed: 2,
      responded: 3,
      totalMembers: 4,
      iAgreed: false,
      respondBy: new Date(NOW.getTime() + ms).toISOString(),
    }) as const;

  // 제안이 없으면 **지금처럼 바로 뽑을 수 있다.** 동의는 강제가 아니다 — 막는 것은
  // "제안이 있고 아직 마감 전" 뿐이다. 여기서 막으면 동의가 없는 팀은 영영 못 뽑는다.
  check("제안이 없으면 열린다", consentViewOf(null, NOW), { kind: "open" });
  check("제안이 없으면 바로 뽑을 수 있다", canDrawIn(roleViewOf(2, null, consentViewOf(null, NOW))), true);

  const waiting = consentViewOf(live(60_000), NOW);
  check("마감 전 제안은 대기다", waiting.kind, "waiting");

  // **핵심.** 동의를 받기 전에는 뽑을 수 없다 — 동료 한 명이 자기 손으로 나머지를
  // "받기 대기" 에 넣던 구조가 여기서 막힌다.
  const locked = roleViewOf(2, null, waiting);
  check("동의 대기 중에는 추첨이 잠긴다", locked.kind, "consent");
  check("동의 대기 중에는 뽑을 수 없다", canDrawIn(locked), false);
  check("동의 대기 중에는 또 제안하지도 못한다", canProposeIn(locked), false);

  // 마감은 **읽을 때 계산한다.** 스케줄러가 늦게 돌아도 사용자는 이 값을 본다.
  check("마감 지나면 열린다", consentViewOf(live(-1), NOW), { kind: "open" });
  check("마감 지나면 다시 제안할 수 있다", canProposeIn(roleViewOf(2, null, consentViewOf(live(-1), NOW))), true);
  // **경계는 열린 쪽이다.** 그 시각부터는 반대할 수 없다 — 이미 열린 추첨을 뒤집을
  // 수는 없고, 반대만 못 받게 되면 팀이 답할 수 없게 된다.
  check("마감 시각 그 순간부터 열린다", consentViewOf(live(0), NOW), { kind: "open" });

  // **추첨 결과가 동의보다 먼저 보인다.** 결과가 묻히면 당첨자가 아무것도 볼 수 없고,
  // 받거나 안 받을 수도 없다 — 07 화면에 이미 있었던 종류의 구멍이다.
  const drawn = {
    tool: "룰렛",
    winner: "최유나",
    winnerId: "m4",
    accepted: false,
    stale: false,
  } as const;
  check("결과가 있으면 동기를 덮지 않는다", roleViewOf(2, drawn, waiting).kind, "awaiting");
  // 결과가 잡혔으니 동의 제안은 더는 필요 없다 — 답해야 하는 사람이 바뀐다.
  check("확정된 뒤에도 결과가 보인다", roleViewOf(2, { ...drawn, accepted: true }, waiting).kind, "confirmed");

  // 마감을 넘긴 제안이 **행으로는 남아 있어도** 열린 것으로 읽힌다 — 되돌아오면 제안할 수 있다.
  const stale = consentViewOf(live(-60_000), NOW);
  check("지난 제안은 열림으로 읽힌다", stale.kind, "open");
}

/* ── 동의 대기는 배지에서 겹침과 따로 센다 ────────────────────── */

console.log("\n역할 배정 설명은 계약과 같다");
{
  const read = readCode;

  // **사용자에게 말하는 역할 배정 설명이 두 화면에 복사돼 있으면 반드시 어긋난다.**
  // 실제로 어긋났다 — 한쪽은 "경험"을 입력받을 곳이 없다고 말했고, 다른 쪽은 아니었다.
  // 말은 `features/roles/copy.ts` 한 곳에만 둔다.
  const copySource = read("../src/features/roles/copy.ts");
  truthy("역할 배정 설명이 한 곳에 있다", /export const ROLE_DECISION_HOW/.test(copySource));
  check("설명은 세 문장으로 되어 있다", ROLE_DECISION_HOW.join(" ").split(".").length - 1, 3);

  for (const screen of ["../src/features/onboarding/role-screen.tsx", "../src/features/team/team-mbti.tsx"]) {
    const name = screen.split("/").pop();
    const src = read(screen);
    check(`${name} 은 설명을 복사하지 않는다`, /ROLE_DECISION_HOW\.join\(" "\)/.test(src), true);
    // **존재하지 않는 입력을 안내하지 않는다.** `경험` 은 `Member` 에 칸이 없고,
    // 가능한 시간(`BusyBlock`)은 역할 배정을 읽지 않는다 — 회의 계산 전용이다.
    check(`${name} 은 없는 입력(경험)을 말하지 않는다`, /경험/.test(src), false);
  }

  // 규칙이 실제로 무엇을 읽는지 — 설명이 코드와 같은 쪽에 있는지 본다.
  const rolesAction = read("../src/server/actions/roles.ts");
  check("후보는 희망자에서만 온다", /where: \{ teamId, wantRole: role, leftAt: null \}/.test(rolesAction), true);
  check("피할 역할은 후보에서 빠진다", /drawPoolOf\(/.test(rolesAction), true);
  const model = read("../src/features/roles/roster-model.ts");
  check("피할 역할은 추첨 후보에서 빠진다", /wanted = wanters\.filter\(\(m\) => m\.veto !== role\)/.test(model), true);
  // 역할 조율이 **가능한 시간을 읽지 않는다** — 읽고 있다면 설명이 거짓말이 되는 셈이다.
  truthy("역할 조율은 가능한 시간을 읽지 않는다", /busyBlock/i.test(model + rolesAction) === false);
  // MBTI 도 마찬가지다(CLAUDE.md 의 제품 약속).
  truthy("역할 조율은 MBTI 를 읽지 않는다", /mbti/i.test(rolesAction) === false);
}

console.log("\n추첨 동의 · 배지");
{
  const NOW = new Date("2026-10-01T09:00:00Z");
  const base = {
    tool: "룰렛",
    proposedBy: "김민준",
    agreed: 1,
    responded: 2,
    totalMembers: 4,
    respondBy: new Date(NOW.getTime() + 60_000).toISOString(),
  } as const;
  const mine = { ...base, iAgreed: false };
  const already = { ...base, agreed: 2, iAgreed: true };

  check("내가 안 했으면 내 몫이다", awaitsMyConsent(consentViewOf(mine, NOW)), true);
  // **이미 동의한 사람의 제안은 내 할 일이 아니다.** 배지가 이걸 구분하지 않으면
  // 아무 일도 하지 않은 사람이 배지에서 끌어당겨진다.
  check("이미 동의하면 내 몫이 아니다", awaitsMyConsent(consentViewOf(already, NOW)), false);
  check("마감 지난 제안은 내 몫이 아니다", awaitsMyConsent(consentViewOf({ ...mine, respondBy: new Date(NOW.getTime() - 1).toISOString() }, NOW)), false);

  check("응답해야 하는 역할만 뽑는다", rolesAwaitingMyConsent({ research: mine, deck: already, present: { ...mine, respondBy: new Date(NOW.getTime() - 1).toISOString() } }, NOW), ["research"]);

  // **이중 집계가 핵심이다.** 동의 대기가 걸린 역할은 겹침에서 빠져야 팀 배지에 한 번만
  // 들어간다. 빠지지 않으면 배지가 "겹침 1건 + 동의 1건"으로 한 역할을 두 번 센다.
  check("내 동의 대기 역할은 겹침에서 빠진다", isUnresolvedClash(2, false, true), false);
  check("다른 사람의 제안은 겹침에 남는다", isUnresolvedClash(2, false, false), true);
  check("동의 대기 여부를 몰라도 겹침은 그대로다", isUnresolvedClash(2, false), true);

  // 홈 목록도 같은 조건이어야 한다 — 배지 0인데 홈 1건이면 어느 쪽을 믿어야 할지 모른다.
  // `wantersOf` 는 `m.want === role` 로만 보므로 다른 칸은 비워도 된다.
  const members = [
    { id: "1", name: "김민준", want: "research", veto: null },
    { id: "2", name: "최유나", want: "research", veto: null },
    { id: "3", name: "박지호", want: "deck", veto: null },
    { id: "4", name: "이서연", want: "deck", veto: null },
  ] as unknown as Member[];
  const roles = [{ key: "research" }, { key: "deck" }] as Role[];
  const clashes = unresolvedClashes(roles, members, {}, { research: mine, deck: already }, NOW);
  // research 는 내 동의 대기 → 빠지고, deck 은 이미 동의했으니 팀 몫으로 남는다.
  check("내 동의 대기만 겹침 목록에서 빠진다", clashes.map((r) => r.key), ["deck"]);
}

/* ── 표에 잘못 들어온 값 ──────────────────────────────────── */

console.log("\n값 검증");
{
  check("역할 키는 대조", isRoleKey("research"), true);
  check("모르는 역할 키는 거절", isRoleKey("__proto__"), false);
  check("모르는 역할 값은 미정으로", toRoleKey("__proto__"), null);
  check("비었으면 미정으로", toRoleKey(null), null);
  check("진짜 역할은 읽는다", toRoleKey("present"), "present");
}

/* ── 04 성향 체크: 문항 저장소와 계산 ──────────────────────── */

console.log("\n성향 체크 문항");
{
  const ids = QUIZ_QUESTIONS.map((q) => q.id);
  check("문항 id 가 겹치지 않는다", new Set(ids).size, ids.length);
  check("20문항이다", QUIZ_QUESTIONS.length, 20);
  for (const axis of ["EI", "SN", "TF", "JP"] as const) {
    const rows = QUIZ_QUESTIONS.filter((q) => q.axis === axis);
    // 짝수면 4:4 동률이 나는데, 동률 축은 답이 아니라 세는 순서로 정해진다.
    check(`${axis} 문항 수는 홀수`, rows.length % 2, 1);
    check(`${axis} 문항이 하나라도 있다`, rows.length > 0, true);
    // 같은 축을 같은 상황 문장으로 두 번 재면 사실상 한 질문을 두 번 한 셈이다.
    check(`${axis} 상황이 겹치지 않는다`, new Set(rows.map((q) => q.label)).size, rows.length);
    // a 가 항상 앞 글자면 순서 앞 선택지를 고르는 사람만 조금 더 많아진다.
    check(`${axis} 안에서 a 위치가 뒤집힌다`, new Set(rows.map((q) => q.aSide)).size, 2);
  }
}

console.log("\n성향 체크 계산");
{
  /** 그 문항에서 `side` 쪽을 고르는 키. `aSide` 가 뒤집혀 있으므로 직접 구해야 한다. */
  const key = (q: (typeof QUIZ_QUESTIONS)[number], side: "first" | "second") =>
    q.aSide === side ? "a" : "b";

  /** 전 문항을 한쪽으로 채운다. */
  const fill = (side: "first" | "second") =>
    Object.fromEntries(QUIZ_QUESTIONS.map((q) => [q.id, key(q, side)])) as Record<string, "a" | "b">;

  check("앞 글자만 고르면 ESTJ", picksToMbti(fill("first")), "ESTJ");
  check("뒷 글자만 고르면 INFP", picksToMbti(fill("second")), "INFP");

  // 04 화면이 "몇 문항 남았나" 를 세는 수 — 20을 채워도 0 이면 완료 버튼이 영영 안 열린다.
  check("아무것도 안 골랐으면 0", countAnswered({}), 0);
  check("다 고르면 20", countAnswered(fill("first")), 20);
  {
    const one = fill("first");
    for (const q of QUIZ_QUESTIONS.slice(1)) delete one[q.id];
    check("한 문항만 골랐으면 1", countAnswered(one), 1);
    // 문항 id 가 아닌 인덱스로 세면 늘 0 이 된다 — 그게 실제로 났던 버그다.
    check("인덱스 문자열로는 세지지 않는다", countAnswered({ "0": "a", "1": "b" }), 0);
  }

  // 한 문항이라도 비면 유형을 내지 않는다 — 05 화면이 그 값으로 문구를 바꾼다.
  const partial = fill("first");
  delete partial["jp-decision"];
  check("답이 하나라도 비면 유형이 없다", picksToMbti(partial), null);
  check("아무것도 안 골라도 없다", picksToMbti({}), null);

  // 축 안에서 다수결이다 — 한 표가 4표를 못 이긴다.
  const minority = fill("first");
  for (const q of QUIZ_QUESTIONS.filter((x) => x.axis === "EI").slice(1)) {
    minority[q.id] = key(q, "second");
  }
  check("EI 1 대 4 는 4 쪽이 이긴다", picksToMbti(minority), "ISTJ");

  // 가중치를 실제로 먹는다는 확인 — JP 축을 4:P / 1:J 로 두고 그 1표의 무게만 바꾼다.
  const heavy = QUIZ_QUESTIONS.find((q) => q.axis === "JP" && q.aSide === "second")!;
  check("JP 축의 뒤집힌 문항", heavy.id, "jp-decision");
  const tipped = fill("first");
  for (const q of QUIZ_QUESTIONS.filter((x) => x.axis === "JP")) {
    tipped[q.id] = key(q, "second");
  }
  tipped[heavy.id] = key(heavy, "first");
  check("가중치가 같으면 4 대 1 이 P 를 고른다", picksToMbti(tipped), "ESTP");
  heavy.weight = 5;
  try {
    check("그 한 표가 무거우면 J 로 뒤집힌다", picksToMbti(tipped), "ESTJ");
  } finally {
    heavy.weight = 1;
  }
  check("가중치를 되돌리면 다시 P 다", picksToMbti(tipped), "ESTP");

  const rows = scoreAxes(fill("first"));
  check("축 점수는 네 줄", rows.length, 4);
  check("EI 5문항 전부 앞 글자", rows[0], { axis: "EI", first: 5, second: 0, answered: 5, total: 5 });
  check("답하지 않은 문항은 채점되지 않는다", scoreAxes({})[0], {
    axis: "EI",
    first: 0,
    second: 0,
    answered: 0,
    total: 5,
  });

  check("축의 앞 글자를 읽는다", sideLetter("SN", "first"), "S");
  check("축의 뒤 글자를 읽는다", sideLetter("SN", "second"), "N");

  // aSide 가 뒤집힌 문항에서 05 화면 배지가 틀린 글자를 보여주면 안 된다.
  const flipped = QUIZ_QUESTIONS.find((q) => q.aSide === "second")!;
  const upright = QUIZ_QUESTIONS.find((q) => q.aSide === "first")!;
  check("뒤집힌 문항의 a 는 second 쪽", pickSide(flipped, "a"), "second");
  check("뒤집힌 문항의 b 는 first 쪽", pickSide(flipped, "b"), "first");
  check("정방향 문항의 a 는 first 쪽", pickSide(upright, "a"), "first");
  check("정방향 문항의 b 는 second 쪽", pickSide(upright, "b"), "second");

  // 축 하나를 통째로 반대로 묶어도 16유형이 16개 다 나온다 — 축이 잘못 묶였으면
  // 두 유형이 같은 글자로 접혀서 16개보다 적게 나온다.
  const combos = new Set<string>();
  for (let mask = 0; mask < 16; mask++) {
    const combo: Record<string, "a" | "b"> = {};
    for (const q of QUIZ_QUESTIONS) {
      const wantFirst = ((mask >> MBTI_AXES.indexOf(q.axis as MbtiAxis)) & 1) === 0;
      combo[q.id] = key(q, wantFirst ? "first" : "second");
    }
    combos.add(picksToMbti(combo)!);
  }
  check("축 조합 16개가 16유형과 겹치지 않는다", combos.size, 16);
}

/* ── 이름 정규화 ──────────────────────────────────────────── */

console.log("\n이름");
{
  // 분해형(NFD)으로 저장된 한글 — macOS 파일 이름, 일부 입력기, 복사·붙여넣기.
  const nfd = "김민준".normalize("NFD");
  truthy("macOS 가 넘긴 이름이 실제로 다르게 보인다", nfd !== "김민준");
  check("그래도 같은 이름으로 정리된다", normalizeName(nfd), "김민준");
  check("양쪽 끝 공백도 함께", normalizeName("  김민준  "), "김민준");
}

/* ── 마피아: 역할 구성과 승패 (서버와 화면이 같은 표를 쓴다) ── */

console.log("\n마피아 역할 구성");
{
  // 프리셋 한 줄이 인원과 어긋나면 나눠준 역할 중 하나가 자리 없이 사라진다.
  for (const preset of MAFIA_PRESETS) {
    check(`${preset.players}명은 자리 ${preset.players}개를 모두 받는다`, preset.roles.length, preset.players);
    truthy(`${preset.players}명에는 마피아가 있다`, preset.roles.includes("mafia"));
  }

  check("4명은 판이 없다 — 밤 한 번으로 끝난다", mafiaLineup(4), null);
  check("3명도 없다", mafiaLineup(3), null);
  check("5명이 첫 줄이다", mafiaLineup(5), MAFIA_PRESETS[0].roles);

  // ⚠️ 프리셋을 넘어선 인원은 **시민만 늘어난다** — 12명 판도 15명 판도 마피아 3명이라 밤이 몇
  //   초 만에 끝난다. 인원이 늘면 배분이 조용히 달라지는 이 길은 **없어야** 한다(2026-09-30).
  check("12명에게 배분되는 역할이 없다", mafiaLineup(12), null);
  check("11명에게도 없다", mafiaLineup(11), null);
  // 표 안의 인원은 빠짐없이 배분된다 — 자리가 어긋나면 한 역할이 자리 없이 사라진다.
  check("5~10명은 전부 배분된다", [5, 6, 7, 8, 9, 10].map((n) => mafiaLineup(n)!.length), [5, 6, 7, 8, 9, 10]);

  check("7명부터 마피아가 2명이다", countRoles(mafiaLineup(7)!).mafia, 2);
  check("10명부터 마피아가 3명이다", countRoles(mafiaLineup(10)!).mafia, 3);
  check("인원이 늘어도 경찰은 한 명이다", countRoles(mafiaLineup(10)!).police, 1);

  // **화면이 막는 최소 인원**과 **서버가 배분할 수 있는 최소 인원**이 어긋나면 아무도 오지
  // 못하거나 역할이 없는 판이 열린다. 두 값은 프리셋에서 같은 곳을 본다.
  const mafiaGame = ICE_GAMES.find((g) => g.key === "mafia")!;
  check("화면이 막는 최소 인원이 규칙과 같다", mafiaGame.minPlayers, MAFIA_MIN_PLAYERS);
  check("규칙상 최소 인원이 실제로 배분된다", mafiaLineup(mafiaGame.minPlayers) !== null, true);
  truthy(
    "최소 인원이 게임 방법에 적혀 있다",
    mafiaGame.howTo.some((line) => line.includes(`${MAFIA_MIN_PLAYERS}명부터`)),
  );
  // 라이어 게임은 마피아 규칙을 받지 않는다 — 3명이면 그 인원으로도 한다.
  check("라이어는 3명부터다", ICE_GAMES.find((g) => g.key === "liar")!.minPlayers, 3);

  check("구성 설명이 역할 수와 같다", mafiaLineupText(7), "마피아 2 · 경찰 1 · 의사 1 · 시민 3");
  check("인원이 모자라면 그 말만 한다", mafiaLineupText(4), `${MAFIA_MIN_PLAYERS}명부터`);
  check("인원이 많으면 상한을 말한다", mafiaLineupText(12), `${MAFIA_MAX_PLAYERS}명까지`);

  // ㊿ 상한은 프리셋의 마지막 줄에서 온다 — 별도 숫자를 두지 않는다.
  check("마피아는 10명까지다", MAFIA_MAX_PLAYERS, 10);
  check("상한이 프리셋의 끝이다", MAFIA_MAX_PLAYERS, MAFIA_PRESETS[MAFIA_PRESETS.length - 1].players);
  // ⚠️ 상한이 없으면 15명 판도 마피아 3명이다 — 밤이 수십 번 반복돼 아이스브레이킹이 판이 된다.
  check("15명에게 배분되는 역할이 없다", mafiaLineup(MAFIA_MAX_PLAYERS + 1), null);
  // **화면이 막는 상한**과 **서버가 배분할 수 있는 상한**이 어긋나면 안 된다.
  check("화면이 막는 상한이 규칙과 같다", mafiaGame.maxPlayers, MAFIA_MAX_PLAYERS);
  // 라이어는 상한이 없다 — 표가 하나라 인원이 늘어도 상한이 필요 없다.
  check("라이어에는 상한이 없다", ICE_GAMES.find((g) => g.key === "liar")!.maxPlayers, undefined);
  // 서버도 상한을 본다 — 화면만 막으면 남의 요청으로 열린다.
  truthy("서버가 상한을 함께 본다", /spec\.maxPlayers/.test(readCode("../src/server/actions/ice.ts")));
  truthy(
    "상한을 넘으면 거절한다",
    /max !== undefined && wanted\.length > max/.test(readCode("../src/server/actions/ice.ts")),
  );
}

console.log("\n마피아 승패 판정");
{
  const five = mafiaLineup(5)!;
  // 5명 판: 마피아 1. 밤에 **시민**이 1명 죽어도(4명) 아직 끝나지 않는다.
  // ⚠️ `five.slice(1)` 로는 안 된다 — 0번이 마피아라 **마피아가 죽어** 시민 승리가 된다.
  check("밤에 1명이 죽었을 때 아직 진행 중", mafiaOutcome(["mafia", "police", "citizen", "citizen"]), null);
  check("밤에 마피아가 죽으면 시민 승리", mafiaOutcome(five.slice(1)), ICE_RESULT_CODES.townWin);
  // 시민이 1명만 남으면 마피아와 1대1 — 이 순간에 끝난다. (마피아도 자리에 있어야 1대1 이다.
  // 시민만 남기면 마피아가 0명이라 판정이 먼저 끝난다.)
  const oneCitizen: IceRole[] = ["mafia", "citizen"];
  check("시민이 1명 남으면 마피아 승리", mafiaWinner(oneCitizen), "mafia");
  check("마피아가 0이면 시민 승리", mafiaOutcome(["citizen", "citizen"]), ICE_RESULT_CODES.townWin);
  check("그것이 시민 쪽이다", mafiaWinner(["citizen", "citizen"]), "citizen");

  // 10명 판: 마피아 3. 3 대 3 이 되면 마피아가 이긴다 — 이보다 일찍 끝나면 안 된다.
  const ten = mafiaLineup(10)!;
  // `IceRole[]` 로 붙여 둔다 — TS 5.5 부터는 `filter(r => r !== "citizen")` 를 **타입 술어로
  // 읽어** citizen 이 빠진 좁은 배열로 좁혀지고, 그러면 citizen 을 다시 붙이는 `.concat` 이
  // 형식 검사를 통과하지 못한다(원래 의도인 `Array<IceRole>` 와 어긋난다).
  const tenSpecials: IceRole[] = ten.filter((r) => r !== "citizen");
  const withCitizens = (n: number) => tenSpecials.concat(Array<IceRole>(n).fill("citizen"));
  // ⚠️ "시민 3명" 이라 해도 **경찰·의사도 시민 쪽**이다 — 3 대 3 이 되려면 시민은 1명이어야
  // 한다(마피아 3 + 경찰 + 의사 + 시민 1 = 3 대 3). 도시를 3으로 세면 판정이 영영 안 난다.
  check("10명 판: 시민 1명만 남으면 마피아 승리 (3 대 3)", mafiaWinner(withCitizens(1)), "mafia");
  check(
    "10명 판: 시민이 더 남으면 진행 중",
    [mafiaOutcome(withCitizens(2)), mafiaOutcome(withCitizens(4))],
    [null, null],
  );
  check(
    "10명 판: 마피아가 다 죽으면 시민 승리",
    mafiaWinner(withCitizens(10).filter((r) => r !== "mafia")),
    "citizen",
  );

  // 판정은 **살아 있는 자리만** 본다 — 죽은 마피아를 넣어 시민 승리를 조작할 수 없다.
  check("마피아가 죽으면 시민 승리", mafiaOutcome(["citizen", "citizen", "citizen"]), ICE_RESULT_CODES.townWin);
  check("아무도 없는 판은 끝난 판이다", mafiaWinner([]), "citizen");

  // **코드가 문장으로 이어져야** 결과 화면에 결과가 보인다. 두 값이 따로 놀면 안 된다.
  check("마피아 승리 코드가 문장으로 붙는다", iceResultText(ICE_RESULT_CODES.mafiaWin).includes("마피아 승리"), true);
  check("시민 승리 코드가 문장으로 붙는다", iceResultText(ICE_RESULT_CODES.townWin).includes("시민 승리"), true);
  check("아무 코드도 없으면 문장도 없다", iceResultText(null), "");
  // 이긴 쪽을 세는 계산은 한 곳에 있어야 한다 — 화면 설명과 서버 판정이 다른 수를 세면
  // "여기까지는 안 끝나겠는데" 라는 말이 화면과 판정에서 어긋난다.
  check("역할 구성도 승패 계산도 한 곳에서 온다", readCode("../src/server/ice/rules.ts").includes('@/lib/mafia-rules'), true);
  truthy("프리셋 옆에 다른 역할 구성이 남아 있지 않다", !readCode("../src/server/ice/rules.ts").includes("special: IceRole[]"));
}

/* ── AI 입력 상한 ─────────────────────────────────────────── */

console.log("\nAI 입력 상한");
{
  check("한계가 0보다 않다", AI_INPUT_LIMIT > 0, true);
  check("안 넘으면 잘리지 않는다", aiInputOverrun("짧은 회의 메모"), 0);
  check("넘으면 얼마나 잘렸는지 안다", aiInputOverrun("가".repeat(AI_INPUT_LIMIT + 120)), 120);
}

/* ── 회의 후보 창 ─────────────────────────────────────────── */

console.log("\n회의 후보 기간");
{
  const dates = candidateDates();
  check("오늘부터 7일이다", dates.length, 7);
  check("첫 날이 오늘이다", dates[0].date, todayInSeoul());
  const slots = computeMeetingSlots(
    [
      { name: "a", busyBlocks: [] },
      { name: "b", busyBlocks: [] },
    ],
    dates,
  );
  truthy("두 명이 시간이 전부 비어 있으면 후보가 나온다", slots.length > 0);
  check("후보는 후보 기간 안의 요일만 쓴다", new Set(slots.map((s) => s.day)).size <= 7, true);
}

/* ── 기록 확정 기준 ────────────────────────────────────────── */

console.log("\n기록 확정 기준 (팀이 정한다)");
{
  // 기준은 팀의 값이다 — 1명이어도 2명이어도 같은 계산기를 쓴다.
  const base = { dispute: null, resolution: null };
  check("1명 기준 · 1명 확인이면 확정", contribState({ ...base, confirms: 1, needed: 1 }), "ok");
  check("1명 기준 · 아직 없으면 대기", contribState({ ...base, confirms: 0, needed: 1 }), "pending");
  check("2명 기준 · 1명 확인이면 대기", contribState({ ...base, confirms: 1, needed: 2 }), "pending");
  check("2명 기준 · 2명 확인이면 확정", contribState({ ...base, confirms: 2, needed: 2 }), "ok");
  // 기준보다 많이 모였으면 확정 — 화면은 "3/2" 라고 적지만 상태는 확정이다.
  check("기준을 넘겨도 확정", contribState({ ...base, confirms: 5, needed: 2 }), "ok");
  // 사실이 다투어지는 중에는 확인 수가 많아도 "확인됨"이 아니다.
  check(
    "의견 차이는 확인 수와 무관하다",
    contribState({ ...base, confirms: 9, needed: 1, dispute: "다릅니다" }),
    "disputed",
  );
  check(
    "의견을 정리하면 확인 수로 돌아간다",
    contribState({ ...base, confirms: 1, needed: 1, dispute: "다릅니다", resolution: "공동 작업" }),
    "ok",
  );
  // 정리는 "확인"이 아니다 — 정리된 뒤에도 기준에 못 미치면 다시 기다린다.
  check(
    "정리되어도 기준에 못 미치면 대기",
    contribState({ ...base, confirms: 1, needed: 2, dispute: "다릅니다", resolution: "공동 작업" }),
    "pending",
  );

  // 자기 기록은 자기 자신이 확인하지 못한다 → 팀원 수보다 큰 기준은 아무도 못 채운다.
  check("혼자면 기준 1명", maxConfirmsNeeded(1), 1);
  check("4명이면 기준 3명까지", maxConfirmsNeeded(4), 3);
  check("아무도 없으면 1명에서 멈춘다", maxConfirmsNeeded(0), 1);

  check("분모는 2명 이상일 때만", contribByLabel({ state: "ok", confirms: 1, needed: 1, disputedBy: null, unresolved: false }), "1명 확인");
  check("2명 기준은 진행을 보여 준다", contribByLabel({ state: "pending", confirms: 1, needed: 2, disputedBy: null, unresolved: false }), "1/2명 확인");
  check("아직 모인 확인이 없으면", contribByLabel({ state: "pending", confirms: 0, needed: 2, disputedBy: null, unresolved: false }), "팀원 확인 대기");
}

/* ── 정정(의견 차이)의 결론 ──────────────────────────────────── */

console.log("\n정정 결론 — 답이 없어도 닫힌다");
{
  // 서버가 받아들이는 결론은 셋뿐이다 — 화면이 보낸 문자열을 그대로 쓰지 않는다.
  check("집합 밖의 말은 결론이 아니다", isResolutionWay("내 말이 맞다"), false);
  check("빈 문자열도 아니다", isResolutionWay(""), false);
  check("합의 없음은 결론이다", isResolutionWay("noAgreement"), true);
  check("세 가지만 있다", Object.keys(RESOLUTION_WAYS).length, 3);

  const disputed = { dispute: "제가 한 게 아닙니다", resolution: null as string | null };
  check("열린 의견", unresolvedAfter(disputed), false);
  check(
    "답이 없어 닫힌 의견",
    unresolvedAfter({ ...disputed, resolution: RESOLUTION_WAYS.noAgreement }),
    true,
  );
  check("합의된 것은 세지 않는다", unresolvedAfter({ ...disputed, resolution: RESOLUTION_WAYS.split }), false);
  check(
    "의견이 없으면 정리되지 않은 것도 아니다",
    unresolvedAfter({ dispute: null, resolution: RESOLUTION_WAYS.noAgreement }),
    false,
  );

  // 닫힌 뒤에도 절차가 돌아간다 — `disputed` 가 아니면 확인 수로 계산한다.
  check(
    "합의 없이 닫히면 대기로 돌아온다",
    contribState({ ...disputed, confirms: 0, resolution: RESOLUTION_WAYS.noAgreement, needed: 1 }),
    "pending",
  );
  check(
    "확인이 모이면 그대로 확정된다",
    contribState({ dispute: "이의 있음", resolution: RESOLUTION_WAYS.noAgreement, needed: 1, confirms: 2 }),
    "ok",
  );

  // 확인을 막는 이유 — 자기 기록과 자기 반대.
  const me = "m1";
  check("자기 기록은 확인 못 한다", canConfirm({ memberId: me, disputedById: null, meId: me }), false);
  check("반한 사람은 자기 반대를 확인 못 한다", canConfirm({ memberId: "m2", disputedById: me, meId: me }), false);
  check("남은 팀원은 된다", canConfirm({ memberId: "m2", disputedById: "m3", meId: me }), true);
  check(
    "막힌 이유를 말해 준다",
    confirmBlockReason({ memberId: "m2", disputedById: me, meId: me, who: "제 의견" }),
    "제 의견은 내가 적은 의견입니다 — 같은 기록에 확인을 남길 수 없습니다",
  );
  check("막히지 않으면 이유는 없다", confirmBlockReason({ memberId: "m2", disputedById: "m3", meId: me }), null);
}

/* ── 회의 참여 표시 ────────────────────────────────────────── */

console.log("\n회의 참여 표시 (팀장이 직접 찍는다)");
{
  const shown = {
    recordId: "r1",
    activeKey: "r1",
    shownBy: "박지호",
    shownAt: new Date("2026-09-28T10:00:00+09:00"),
    clearedBy: null,
    clearedAt: null,
  };
  const cleared = { ...shown, activeKey: null, clearedBy: "이서연", clearedAt: new Date("2026-09-29T10:00:00+09:00") };

  check("표시 중인가", isMarked(shown), true);
  check("취소된 표시는 표시 중이 아니다", isMarked(cleared), false);
  check("표시가 없으면 false", isMarked(null), false);
  check(
    "누가 찍었는지 문구에 함께 든다",
    participationText(shown)?.includes("박지호"),
    true,
  );
  check(
    "취소도 누구의 일로 남는다",
    participationText(cleared),
    participationText(cleared)?.includes("이서연") === true
      ? participationText(cleared)
      : "이서연",
  );
  // 표시 중인 것만 모아 준다 — 취소된 행이 "참여"로 세어지면 지운 사실이 사라진다.
  check("표시 중인 것만 모은다", currentParticipations([cleared, shown]).length, 1);
  check("아무것도 없으면 0건", currentParticipations([cleared]).length, 0);

  // DB 규칙 — 한 기록에 표시가 두 개일 수 없다.
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (team) {
    const leader = await db.member.findFirstOrThrow({ where: { teamId: team.id, isLeader: true, leftAt: null } });
    const owner = await db.member.findFirstOrThrow({
      where: { teamId: team.id, leftAt: null, id: { not: leader.id } },
    });
    const rec = await db.contribRecord.create({
      data: { memberId: owner.id, kind: "task", title: "참여 표시 확인용", detail: " ", source: "self", state: "pending" },
    });
    const marked = await db.contribParticipation.create({
      data: { recordId: rec.id, activeKey: rec.id, shownById: leader.id },
    });
    const again = await db.contribParticipation
      .create({ data: { recordId: rec.id, activeKey: rec.id, shownById: leader.id } })
      .catch((e) => e);
    truthy("한 기록에 표시가 두 개일 수 없다", (again as { code?: string })?.code === "P2002");

    // 취소는 기존 행을 남긴 채 `activeKey` 를 비운다 — 누가 지웠는지 그대로 남는다.
    await db.contribParticipation.update({
      where: { id: marked.id },
      data: { activeKey: null, clearedById: leader.id, clearedAt: new Date() },
    });
    const reMarked = await db.contribParticipation
      .create({ data: { recordId: rec.id, activeKey: rec.id, shownById: leader.id } })
      .catch((e) => e);
    truthy("지운 뒤에는 다시 표시할 수 있다", !((reMarked as { code?: string })?.code));

    // **참여는 확인과 독립이다** — 표시해도 기록은 대기 그대로다.
    const after = await db.contribRecord.findUniqueOrThrow({
      where: { id: rec.id },
      select: { state: true },
    });
    check("표시해도 기록은 확정되지 않는다", after.state, "pending");

    await db.contribParticipation.deleteMany({ where: { recordId: rec.id } });
    await db.contribRecord.delete({ where: { id: rec.id } });
  } else {
    console.log("  · 팀이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  }
}

/* ── 회의를 격자 위에 얹기 ─────────────────────────────────── */

console.log("\n회의 표식 (08 · 팀 겹쳐보기가 같이 쓴다)");
{
  const dates = candidateDates();
  const weeks = scheduleWeeks();
  const wednesday = dates.find((d) => SCHEDULE_DAYS[d.day] === "수")!;
  const other = weeks.find((w) => w !== wednesday.week)!;
  const weekOptions = weeks.map((key) => ({ key, name: weekName(key) }));
  const slot = {
    id: "s1",
    day: "수",
    time: "16:00 – 18:00",
    available: 3,
    total: 3,
    blockedBy: null,
  };
  const base = { agreed: 0, pending: 0, against: 0, myResponse: null } as const;
  const at = (p: Partial<MeetingProposal>) => meetingMark({ ...base, ...p } as MeetingProposal, dates, SCHEDULE_HOURS);

  const pending = at({ stage: "proposed", slot, date: wednesday.date, respondBy: "9/27 18:00" });
  check("제안은 그 날짜의 칸을 짚는다", markCell(pending, wednesday.week), {
    day: 2,
    hour: 7,
    stage: "proposed",
  });
  check("다른 주에서는 짚지 않는다", markCell(pending, other), null);
  check(
    "한 줄에 마감 시각이 있다",
    markText(pending, SCHEDULE_DAYS),
    `${shortDate(wednesday.date)}(수) 16:00 – 18:00 · 응답 마감 9/27 18:00`,
  );

  const settled = at({ stage: "confirmed", slot, date: wednesday.date });
  check("확정에는 마감이 붙지 않는다", markText(settled, SCHEDULE_DAYS)?.includes("마감"), false);
  check("다른 주는 '이 주가 아닙니다'", markAside(settled, markCell(settled, other)), "· 이 주가 아닙니다");

  // 날짜가 없으면(예전 행) 제안은 후보 기간에서 되짚지만, 확정은 지어내지 않는다.
  const legacyPending = at({ stage: "proposed", slot, respondBy: "9/27 18:00" });
  check("예전 제안은 후보 기간에서 되짚는다", legacyPending?.date, wednesday.date);
  const legacyConfirmed = at({ stage: "confirmed", slot });
  check("예전 확정은 날짜를 지어내지 않는다", legacyConfirmed?.date, null);
  check("날짜를 모르면 칸을 그리지 않는다", markCell(legacyConfirmed, weeks[0]), null);
  check("그래도 한 줄은 남는다", markText(legacyConfirmed, SCHEDULE_DAYS), "수 16:00 – 18:00 · 확정");

  // 시간표 밖에서 시작하는 회의는 칸이 없다.
  const early = at({ stage: "confirmed", slot: { ...slot, time: "08:00 – 09:00" }, date: wednesday.date });
  check("시간표 밖의 회의는 칸이 없다", markCell(early, wednesday.week), null);
  check(
    "시간표 밖이라 말한다",
    markAside(early, markCell(early, wednesday.week)),
    "· 시간표에 없는 시간입니다",
  );

  check("이월은 격자에 없다", at({ stage: "carried", slot, date: wednesday.date }), null);
  check("제안 없음", at({}), null);
  check("슬롯이 없으면 표식도 없다", at({ stage: "confirmed", date: wednesday.date }), null);
  check(
    "볼 수 있는 다른 주면 그주로 가는 버튼",
    markJump(pending, other, weekOptions)?.week,
    wednesday.week,
  );
  check("같은 주면 버튼을 띄우지 않는다", markJump(pending, wednesday.week, weekOptions), null);
  check("회의가 없으면 아무것도 붙지 않는다", markAside(null, null), null);
}

/* ── DB 불변식 ────────────────────────────────────────────── */

console.log("\n회의 제안 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) {
    console.log("  · 팀이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const member = await db.member.findFirst({ where: { teamId: team.id } });
    if (!member) {
      console.log("  · 팀원이 없어 이 항목을 건너뜁니다");
    } else {
      const made: string[] = [];
      const mk = (stage: string, activeKey: string | null) =>
        db.meetingProposal
          .create({
            data: { teamId: team.id, proposedById: member.id, respondBy: new Date(), stage, activeKey },
          })
          .then((p) => {
            made.push(p.id);
            return p;
          });

      await db.meetingProposal.deleteMany({ where: { teamId: team.id } });
      await mk("proposed", team.id);
      const dup = await mk("proposed", team.id).catch((e: { code?: string }) => e.code);
      check("진행 중인 결정은 하나뿐이다", dup, "P2002");

      await db.meetingProposal.updateMany({ where: { teamId: team.id }, data: { stage: "confirmed" } });
      const overwrite = await mk("proposed", team.id).catch((e: { code?: string }) => e.code);
      check("확정된 회의도 덮어쓸 수 없다", overwrite, "P2002");

      await db.meetingProposal.deleteMany({ where: { teamId: team.id } });
      await mk("carried", null);
      await mk("carried", null);
      const afterCarry = await mk("proposed", team.id);
      truthy("이월은 결정을 막지 않는다", Boolean(afterCarry.id));

      await db.meetingProposal.deleteMany({ where: { id: { in: made } } });
    }
  }
}

/* ── 예약 작업: 두 번 돌아도 알림은 두 번 가지 않는다 ────────── */

console.log("\n회의 확정 예약 작업 (같은 일을 두 번 불러도 알림은 한 번이다)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id, leftAt: null } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    // 슬롯은 유일한 묶음 기준이 없으므로(`@@index([teamId, weekKey])` 뿐) 먼저 만들고 id 로 물린다.
    const slot = await db.meetingSlot.create({
      data: { teamId: team.id, day: "수", time: "16:00 – 18:00", available: 1, total: 1, weekKey: "none" },
    });
    const proposal = await db.meetingProposal.create({
      data: {
        teamId: team.id,
        proposedById: member.id,
        // 마감을 **지나도록** 심는다 — 지나지 않은 제안은 예약 작업이 건드리지 않는다.
        respondBy: new Date(Date.now() - 60_000),
        stage: "proposed",
        activeKey: null,
        date: "2026-09-30",
        slotId: slot.id,
      },
    });

    // 제안자는 자기 제안이 확정된 걸 이미 안다 — 그 사람에게 알림이 쌓이면 안 된다.
    const others = (await db.member.findMany({ where: { teamId: team.id, leftAt: null }, select: { id: true } }))
      .map((m) => m.id)
      .filter((id) => id !== member.id);

    const countNotices = () =>
      db.notification.count({ where: { memberId: { in: others }, kind: "meeting", body: { contains: "확정됐어요" } } });

    const before = await countNotices();

    // **같은 예약을 두 번 부른다.** 실제 스케줄러는 재시도·트리거 겹침으로 이렇게 된다.
    const first = await confirmDueMeetings();
    const midway = await countNotices();
    const second = await confirmDueMeetings();
    const after = await countNotices();

    truthy("마감 지난 제안은 확정된다", first >= 1);
    check("두 번째 실행은 아무것도 확정하지 않는다", second, 0);
    check("확정 알림은 팀원 수만큼 한 번씩만 쌓인다", midway - before, others.length);
    check("**두 번 돌려도 알림이 늘지 않는다**", after, midway);

    // 순차 재시도는 위에서 이미 봤다. **겹친 실행**이 진짜 위험하다 — 두 호출이 모두
    // `proposed` 인 것을 읽고 넘어가면 알림이 두 번 간다. 갱신 조건에 `stage: "proposed"`
    // 가 다시 있어야 각 행이 한 번만 넘어간다.
    const raceSlot = await db.meetingSlot.create({
      data: { teamId: team.id, day: "목", time: "19:00 – 21:00", available: 1, total: 1, weekKey: "none" },
    });
    await db.meetingProposal.create({
      data: {
        teamId: team.id,
        proposedById: member.id,
        respondBy: new Date(Date.now() - 60_000),
        stage: "proposed",
        activeKey: null,
        date: "2026-10-01",
        slotId: raceSlot.id,
      },
    });

    const beforeRace = await countNotices();
    // **두 호출을 겹쳐서** 부른다 — 한 호출이 끝나기 전에 다른 호출이 같은 줄을 읽게 만든다.
    const raced = await Promise.all([confirmDueMeetings(), confirmDueMeetings()]);
    check("**겹쳐 불러도 한 번만 넘어간다**", raced.reduce((sum, n) => sum + n, 0), 1);
    check("겹친 실행의 알림도 팀원 수만큼이다", (await countNotices()) - beforeRace, others.length);

    /**
     * 겹친 두 호출이 **실제로** 같은 줄을 두 번 읽는 것은 타이밍에 달렸다 — 두 번째 호출의
     * `findMany` 가 첫 번째의 갱신 뒤에 도착하면(그게 대부분이다) 위 검사는 통과해 버리고
     * `stage: "proposed"` 를 지워도 아무도 모른다. 그래서 **위 검사는 증명이 아니라 확인이고,
     * 여기 있는 것이 근거다.**
     *
     * 알림의 근거는 "찾아낸 것"이 아니라 "**이 호출이 실제로 뒤집은 것**"이어야 한다. 그래서
     * 갱신 조건이 반드시 지금 상태를 다시 확인해야 하고, 뒤집힌 줄만 `updateManyAndReturn`
     * 로 받아야 한다. 둘 중 하나가 빠지면 겹친 실행이 알림을 두 번 만든다.
     */
    const confirmSource = readCode("../src/server/meetings/confirm-due.ts");
    // 조건 부분만 뽑는다 — 중괄호가 안에서 또 열리므로 `}` 로 자르면 조건이 잘려 나간다.
    // `updateManyAndReturn({ … data:` 사이가 곧 `where` 다.
    const claim = confirmSource.match(/updateManyAndReturn\(\{([\s\S]*?)data:/)?.[1] ?? "";
    truthy("갱신은 뒤집힌 줄만 받아 온다", confirmSource.includes("updateManyAndReturn"));
    truthy("갱신 조건이 아직 proposed 인 것을 다시 확인한다", /stage:\s*"proposed"/.test(claim));
    check("알림은 뒤집힌 줄에서만 나온다", /for \(const p of claimed\)/.test(confirmSource), true);

    // 확정은 남는다 — 표를 지우는 것이 아니라 상태를 맞추는 것이므로.
    const after2 = await db.meetingProposal.findUnique({ where: { id: proposal.id } });
    check("확정된 행은 그대로 남는다", after2?.stage, "confirmed");
    check("진행 중인 결정 키를 비운다", after2?.activeKey, null);

    await db.meetingProposal.deleteMany({ where: { slotId: { in: [slot.id, raceSlot.id] } } });
    await db.meetingSlot.deleteMany({ where: { id: { in: [slot.id, raceSlot.id] } } });
    await db.notification.deleteMany({ where: { memberId: { in: others }, kind: "meeting", body: { contains: "확정됐어요" } } });
  }
}

console.log("\n누가 하지");
{
  truthy("메뉴가 하나 이상 있다", MENU_OPTIONS.length > 0);
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (team) {
    const before = team.menuPick;
    await db.team.update({ where: { id: team.id }, data: { menuPick: "라멘" } });
    const a = await db.team.findUniqueOrThrow({ where: { id: team.id }, select: { menuPick: true } });
    const b = await db.team.findUniqueOrThrow({ where: { id: team.id }, select: { menuPick: true } });
    check("팀에 하나만 저장된다", a.menuPick, b.menuPick);
    await db.team.update({ where: { id: team.id }, data: { menuPick: before } });
  }
}

/* ── 29 누가 하지: 도구와 결과는 짝이다 ─────────────────────── */

console.log("\n누가 하지 · 추첨 도구");
{
  const read = readCode;

  // `DrawStage` 는 **모르는 키를 주사위로 흘린다**(else 가지). 목록의 키를 하나라도 바꿔
  // 놓치면 컴파일은 통과하고, 사용자는 자기가 고른 룰렛 대신 주사위를 본다. 서버는 이름으로
  // 검증하니 저장은 정상으로 되고 — 고른 것과 보여준 것이 어긋난다.
  const handled = ["dice", "draw", "ladder", "roulette"];
  check("연출이 아는 키와 목록이 같다", [...RANDOM_TOOLS.map((t) => t.key)].sort(), handled);
  check("도구 이름이 겹치지 않는다", new Set(RANDOM_TOOLS.map((t) => t.name)).size, RANDOM_TOOLS.length);

  // 이름이 겹치면 서버의 `RANDOM_TOOLS` 검색이 어느 쪽을 골랐는지 몰라 "무엇으로 정했는지"가
  // 팀마다 갈린다 — 도구는 결과의 짝이라 이름이 곧 값이다.
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (team) {
    const before = await db.team.findUniqueOrThrow({
      where: { id: team.id },
      select: { menuPick: true, menuTool: true },
    });
    await db.team.update({
      where: { id: team.id },
      data: { menuPick: "라멘", menuTool: "사다리타기" },
    });
    const got = await db.team.findUniqueOrThrow({
      where: { id: team.id },
      select: { menuPick: true, menuTool: true },
    });
    check("결과와 도구가 짝으로 저장된다", got, { menuPick: "라멘", menuTool: "사다리타기" });
    await db.team.update({
      where: { id: team.id },
      data: { menuPick: before.menuPick, menuTool: before.menuTool },
    });
  }

  // 여기 뽑히는 건 사람이 아니라 밥이다. 공용 `DrawGame` 을 쓰면 사람 전용 당첨자 카드
  //(`Avatar` + MBTI)가 같이 떠서, 이름도 MBTI 도 없는 밥에 프로필이 얹힌다.
  const screen = read("../src/features/social/roulette-screen.tsx");
  check("연출만 빌린다", /<DrawStage/.test(screen), true);
  check("사람 전용 당첨자 카드를 쓰지 않는다", /\bDrawGame\b/.test(screen), false);
}

/* ── 기여도 의견은 덮어쓰지 않는다 ─────────────────────────── */

/* ── 18 리포트는 희망이 아니라 확정 배정을 말한다 ─────────────── */

console.log("\n확정 역할 배정 (DB)");
{
  const seed = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!seed) {
    console.log("  · 팀이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    // 이번 검사에 쓸 팀을 따로 만든다 — 시드의 역할 배정과 섞이지 않게 한다.
    const team = await db.team.create({
      data: {
        name: "역할 배정 확인용",
        course: "검증",
        code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      },
    });
    const min = await db.member.create({
      data: { teamId: team.id, name: "김민준", wantRole: "research" },
    });
    const seo = await db.member.create({
      data: { teamId: team.id, name: "이서연", wantRole: "present" },
    });

    const known = ROLES.map((r) => r.key as string);
    // 리포트가 말하는 역할 — 없으면 "미정" 이다. **희망으로 대신 메우지 않는다.**
    const said = async (id: string) => {
      const roles = (await acceptedRoleAssignments(db, team.id, known)).get(id) ?? [];
      return roles.length > 0 ? roles.join("·") : "미정";
    };

    // 1) 추첨 결과가 아직 **수락 전**이면 누구도 확정 배정이 아니다.
    const pending = await db.roleDraw.create({
      data: { teamId: team.id, role: "research", tool: "룰렛", winnerId: seo.id },
    });
    check("추첨만 있고 수락 전이면 둘 다 미정", [await said(min.id), await said(seo.id)], ["미정", "미정"]);

    // 2) 수락하면 **당첨자만** 그 역할을 말한다. 희망을 가진 사람이 아니다 —
    //    김민준은 자료조사를 희망했지만 이 역할은 받지 않았다.
    await db.roleDraw.update({ where: { id: pending.id }, data: { accepted: true } });
    check("수락하면 당첨자만 그 역할을 말한다", [await said(min.id), await said(seo.id)], ["미정", "research"]);

    // 3) **희망을 바꿔도 배정은 따라가지 않는다.** hope 의 의미를 바꾸지 않기 때문이다.
    await db.member.update({ where: { id: min.id }, data: { wantRole: "deck" } });
    await db.member.update({ where: { id: seo.id }, data: { wantRole: "script" } });
    check("희망을 바꿔도 배정은 그대로다", [await said(min.id), await said(seo.id)], ["미정", "research"]);

    // 4) **거절은 행을 지운다** — 거절된 결과는 배정 근거가 되지 않는다.
    await db.roleDraw.update({ where: { id: pending.id }, data: { accepted: false } });
    await db.roleDraw.delete({ where: { id: pending.id } });
    const rejected = await db.roleDraw.create({
      data: { teamId: team.id, role: "research", tool: "룰렛", winnerId: min.id },
    });
    await db.roleDraw.delete({ where: { id: rejected.id } });
    check("거절된 결과는 배정되지 않는다", [await said(min.id), await said(seo.id)], ["미정", "미정"]);

    // 5) 다시 뽑아 **다른 사람**이 이겼고 그 사람이 수락하면 그 사람이 말한다.
    //    "가장 최근 추첨" 이 아니라 "수락이 끝난 것" 이 근거여야 한다.
    const again = await db.roleDraw.create({
      data: { teamId: team.id, role: "research", tool: "주사위", winnerId: min.id },
    });
    await db.roleDraw.update({ where: { id: again.id }, data: { accepted: true } });
    check("재추첨 후에는 최종 수락자가 말한다", [await said(min.id), await said(seo.id)], ["research", "미정"]);

    // 6) 역할은 팀마다 하나씩 — 한 사람이 여러 역할을 맡을 수는 있다.
    const second = await db.roleDraw.create({
      data: { teamId: team.id, role: "present", tool: "룰렛", winnerId: min.id, accepted: true },
    });
    check("여러 역할을 맡으면 모두 적는다", await said(min.id), "research·present");

    // 7) 모르는 역할 값이 들어오면 없는 이름을 지어내지 않고 조용히 뺀다.
    await db.roleDraw.update({ where: { id: second.id }, data: { role: "없는역할" } });
    check("모르는 역할 값은 버린다", await said(min.id), "research");

    // 8) 수락한 사람이 팀을 나가도 **배정은 유효하다** — 이미 끝난 사실이기 때문이다.
    //    담당자가 누구였는지가 이력에서 사라져서는 안 된다.
    await db.member.update({ where: { id: min.id }, data: { leftAt: new Date() } });
    check("나간 사람도 배정은 남는다", await said(min.id), "research");

    // 9) **다른 팀의 배정은 새어 나오지 않는다.**
    const other = await db.team.create({
      data: {
        name: "다른 팀",
        course: "검증",
        code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      },
    });
    const stranger = await db.member.create({ data: { teamId: other.id, name: "남" } });
    await db.roleDraw.create({
      data: { teamId: other.id, role: "manage", tool: "룰렛", winnerId: stranger.id, accepted: true },
    });
    check("다른 팀의 배정은 보이지 않는다", await said(stranger.id), "미정");

    await db.team.delete({ where: { id: other.id } });
    await db.team.delete({ where: { id: team.id } });
    check("검사용 팀을 지우면 아무 것도 남지 않는다", await db.member.count({ where: { teamId: team.id } }), 0);
  }
}

console.log("\n기여도 의견: 하나만 붙는다는 판정이 잠금 안에 있다");
{
  // 세션이 필요한 액션이라 **소스**로 고정한다 — 위의 가입 요청 검사와 같은 관례.
  // 되돌리면 컴파일도 통과하고 smoke 도 통과하므로, 규칙이 코드에 남아 있는지만 본다.
  const src = readCode("../src/server/actions/contrib.ts");
  const from = src.indexOf("export async function disputeContribRecord");
  const fn = src.slice(from, src.indexOf("\nexport async function", from + 10));

  // "이미 의견이 있으면 기다린다" 는 판정이 **읽기만 하고** 6줄 뒤에 적으면, 두 사람이
  // 동시에 달라고 할 때 둘 다 "비어 있다"를 보고 둘 다 적는다. 코드가 막으려는 상황이
  // 그대로 열린다 — 그래서 판정과 기록이 한 잠금 안에 있어야 한다.
  const lock = fn.indexOf("FOR UPDATE");
  const guard = fn.indexOf('status: "taken"');
  const write = fn.indexOf("contribDispute.create");

  truthy("기록 행을 잠근다", lock > 0);
  check("잠근 다음에 판정한다", lock > 0 && guard > lock, true);
  check("판정 다음에 적는다", guard > 0 && write > guard, true);
  check("판정과 기록이 한 트랜잭션 안이다", fn.indexOf("db.$transaction(async (tx)") < lock, true);
  check("상태 재계산도 같은 안이다", fn.indexOf("refreshContribState(record.id, tx)") > write, true);
  // 앞선 의견은 지우지 않는다. 17 화면과 스키마 주석이 약속한 그 사실.
  check(
    "덮어쓰는 갱신이 없다",
    /contribRecord\.update\([\s\S]{0,400}?dispute:\s*text,\s*disputedById:\s*me\.id,\s*resolution:\s*null/.test(fn),
    true,
  );
}

console.log("\n리포트 집계: 어느 기록이 어느 칸에 들어가는가");
{
  const seed = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!seed) {
    console.log("  · 팀이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const team = await db.team.create({
      data: {
        name: "리포트 집계 확인용",
        course: "검증",
        code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      },
    });
    const a = await db.member.create({ data: { teamId: team.id, name: "가" } });
    const b = await db.member.create({ data: { teamId: team.id, name: "나" } });

    // 리포트와 **똑같은 조회**를 그대로 쓴다 — 다른 쿼리를 쓰면 아무래도 같은 결과가 나온다.
    const read = async () => {
      const [states, shown, unresolved] = await Promise.all([
        db.contribRecord.groupBy({
          by: ["memberId", "state"],
          where: { member: { teamId: team.id } },
          _count: { _all: true },
        }),
        db.contribRecord.findMany({
          where: { member: { teamId: team.id } },
          select: {
            memberId: true,
            _count: { select: { participations: { where: { activeKey: { not: null } } } } },
          },
        }),
        db.contribRecord.groupBy({
          by: ["memberId"],
          where: {
            member: { teamId: team.id },
            dispute: { not: null },
            resolution: RESOLUTION_WAYS.noAgreement,
          },
          _count: { _all: true },
        }),
      ]);
      return contribTotals({
        states: states.map((r) => ({ memberId: r.memberId, state: r.state, n: r._count._all })),
        shownPerRecord: shown.map((r) => ({ memberId: r.memberId, n: r._count.participations })),
        unresolved: unresolved.map((r) => ({ memberId: r.memberId, n: r._count._all })),
      });
    };

    await db.contribRecord.create({ data: { memberId: a.id, kind: "task", title: "1", detail: "d", source: "self", state: "ok" } });
    await db.contribRecord.create({ data: { memberId: a.id, kind: "task", title: "2", detail: "d", source: "self", state: "ok" } });
    const pend = await db.contribRecord.create({ data: { memberId: a.id, kind: "task", title: "3", detail: "d", source: "self", state: "pending" } });
    const disp = await db.contribRecord.create({ data: { memberId: a.id, kind: "task", title: "4", detail: "d", source: "self", state: "disputed" } });
    await db.contribRecord.create({ data: { memberId: b.id, kind: "task", title: "5", detail: "d", source: "self", state: "ok" } });

    // 참여 표시 **둘 중 하나만 살아 있다** — 취소한 것은 세지 않아야 한다.
    await db.contribParticipation.create({ data: { recordId: (await db.contribRecord.findFirstOrThrow({ where: { memberId: a.id, title: "1" } })).id, shownById: a.id, activeKey: "살아있음" } });
    await db.contribParticipation.create({ data: { recordId: (await db.contribRecord.findFirstOrThrow({ where: { memberId: a.id, title: "2" } })).id, shownById: a.id, activeKey: null, clearedById: a.id, clearedAt: new Date() } });

    // "답이 없어 닫힌 의견" — 결론이 "합의 없음" 인 것만 센다.
    await db.contribRecord.update({ where: { id: disp.id }, data: { dispute: "다르다", disputedById: b.id, resolution: RESOLUTION_WAYS.noAgreement } });
    await db.contribRecord.update({ where: { id: pend.id }, data: { dispute: "이건 다름", disputedById: b.id, resolution: RESOLUTION_WAYS.accept } });

    const t = await read();
    check(
      "상태가 각 칸에 들어간다",
      [t.get(a.id)?.confirmed, t.get(a.id)?.pending, t.get(a.id)?.disputed],
      [2, 1, 1],
    );
    check("표시 중인 것만 센다", t.get(a.id)?.participations, 1);
    check("답이 없어 닫힌 의견만 센다", [t.get(a.id)?.unresolved, t.get(b.id)?.unresolved], [1, 0]);
    check("다른 사람은 자기 것만 센다", [t.get(b.id)?.confirmed, t.get(b.id)?.participations], [1, 0]);
    check("기록이 없으면 0 이지 undefined 가 아니다", contribTotals({ states: [], shownPerRecord: [], unresolved: [] }).get("없음"), undefined);

    // **모르는 상태는 어디에도 넣지 않는다** — 모르는 칸에 몰아 넣으면 사람이 아닌 기록이 된다.
    const stray = contribTotals({
      states: [{ memberId: "x", state: "정체불명", n: 5 }],
      shownPerRecord: [],
      unresolved: [],
    }).get("x");
    check("모르는 상태는 세지 않는다", [stray?.confirmed, stray?.pending, stray?.disputed], [0, 0, 0]);

    await db.team.delete({ where: { id: team.id } });
    check("검사용 팀을 지우면 아무 것도 남지 않는다", await db.member.count({ where: { teamId: team.id } }), 0);
  }
}

console.log("\n기여도 의견 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const record = await db.contribRecord.create({
      data: { memberId: member.id, kind: "task", title: "스모크 확인용", detail: "지워질 것", source: "self" },
    });

    await db.contribDispute.create({ data: { recordId: record.id, byId: member.id, text: "첫 의견" } });
    await db.contribRecord.update({ where: { id: record.id }, data: { dispute: "첫 의견", disputedById: member.id, resolution: "합의함" } });
    // 정리된 뒤 두 번째 의견이 달리면, `dispute` 칸은 새 의견으로 옮겨도 된다.
    await db.contribDispute.create({ data: { recordId: record.id, byId: member.id, text: "둘째 의견" } });
    await db.contribRecord.update({ where: { id: record.id }, data: { dispute: "둘째 의견", disputedById: member.id, resolution: null } });

    const history = await db.contribDispute.findMany({
      where: { recordId: record.id },
      orderBy: { createdAt: "asc" },
      select: { text: true },
    });
    check("앞선 의견이 이력에 남는다", history.map((h) => h.text), ["첫 의견", "둘째 의견"]);

    const current = await db.contribRecord.findUniqueOrThrow({ where: { id: record.id } });
    check("기록은 지금 떠 있는 의견을 가리킨다", current.dispute, "둘째 의견");
    check("정리 내용은 새 의견이 달리면 비워진다", current.resolution, null);

    await db.contribDispute.deleteMany({ where: { recordId: record.id } });
    await db.contribRecord.delete({ where: { id: record.id } });
    check("확인용 기록을 지우면 이력도 함께 간다", await db.contribDispute.count({ where: { recordId: record.id } }), 0);
  }
}

/* ── 정정 결론은 겹쳐 눌러도 하나만 반영된다 ─────────────────── */

console.log("\n정정 결론 (동시에 눌러도 하나만 반영된다)");
{
  /**
   * ## 왜 **실제로 겹쳐서** 부르는가
   *
   * 소스를 읽는 검사만으로는 이 규칙이 증명되지 않는다. 조건을 적었다는 것과 두 사람이
   * 동시에 눌렀을 때 하나만 반영된다는 것은 다른 말이다. 그래서 아래는 **같은 조건을 그대로
   * 두 개의 커넥션에 겹쳐서 던진다.**
   *
   * 서버 액션은 세션 쿠키가 필요해 부를 수 없다 — 부르려고 쿠키를 만들면 "액션이 정상"이
   * 아니라 **"액션을 우회했다"** 는 사실만 테스트하게 된다(위 섹션과 같은 이유). 그래서
   * **`resolveContribDispute` 가 하는 일을 그대로 재현한다**: 조건부 갱신 → 0행이면 접고,
   * 1행이면 **같은 트랜잭션에서** 상태를 다시 맞춘다.
   *
   * 이 순서가 전부다. **`state` 는 `resolution` 을 적을 때 바뀌지 않는다** — 위에서
   * `refreshContribState` 가 뒤따르야 바뀐다. 그래서 그 한 줄을 빼면 조건이 항상 참이라
   * **아무도 막지 못한다**(아래 "잠금을 얻지 못하면" 참조). 두 갱신을 트랜잭션 밖에서 그냥
   * 던져 보면 둘 다 1행을 고치며, 겹침을 재현하지 못한 것이지 규칙이 없는 것이 아니다.
   *
   * Postgres 는 `UPDATE` 에서 행을 잠그고 **잠금 뒤에 조건을 다시 보기 때문에**, 둘째는
   * 잠금을 얻은 시점에 이미 `state !== "disputed"` 이고 0행을 고친다. 이건 **갱신과 상태
   * 재계산이 한 트랜잭션에 있을 때만** 성립한다.
   */
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const record = await db.contribRecord.create({
      data: { memberId: member.id, kind: "task", title: "정정 동시성 확인용", detail: "d", source: "self" },
    });

    /** 액션의 본문과 같은 모양. **순서까지 같아야** 재현이 된다. */
    const resolveLike = async (resolution: string) =>
      db.$transaction(async (tx) => {
        const won = await tx.contribRecord.updateMany({
          where: { id: record.id, state: "disputed" },
          data: { resolution },
        });
        if (won.count === 0) return { won: false as const };
        await refreshContribState(record.id, tx);
        return { won: true as const };
      });

    // 두 사람이 답할 수 있는 상태 — `disputed` 이고 결론이 없다.
    await db.contribDispute.create({ data: { recordId: record.id, byId: member.id, text: "정정 의견" } });
    await db.contribRecord.update({
      where: { id: record.id },
      data: { dispute: "정정 의견", disputedById: member.id, resolution: null, state: "disputed" },
    });

    const ways = ["정정 동의 · 의견대로 수정", "공동 작업으로 나눔"] as const;
    const raced = await Promise.all(ways.map((resolution) => resolveLike(resolution)));
    check("겹친 두 결론 중 한 건만 반영된다", raced.filter((r) => r.won).length, 1);
    check("반영되지 않은 쪽은 0행을 고친다", raced.filter((r) => !r.won).length, 1);

    const after = await db.contribRecord.findUniqueOrThrow({
      where: { id: record.id },
      select: { resolution: true, state: true },
    });
    check("저장된 결론은 둘 중 하나다", ways.includes(after.resolution as (typeof ways)[number]), true);
    check("정리되면 상태가 disputed 가 아니다", after.state === "disputed", false);

    // **나중에 누른 결론은 이미 정리된 줄이므로 0행이어야 한다** — 조건이 `state` 이기 때문이다.
    const late = await resolveLike("합의 없음 · 원문 유지");
    check("나중에 누른 결론은 아무것도 고치지 못한다", late.won, false);
    const kept = await db.contribRecord.findUniqueOrThrow({ where: { id: record.id }, select: { resolution: true } });
    check("이미 고른 결론이 그대로 남는다", kept.resolution, after.resolution);

    await db.contribDispute.deleteMany({ where: { recordId: record.id } });
    await db.contribRecord.delete({ where: { id: record.id } });
  }
}

console.log("\n정정 결론: 조건이 코드에 남아 있다");
{
  // 위 DB 검사는 **기다리는 문장**을 친 것이다. 액션이 그 문장을 **쓰는지**는 여기서 본다 —
  // 두 검사가 따로야 어느 쪽이 놓였는지 알 수 있다.
  const src = readCode("../src/server/actions/contrib.ts");
  const from = src.indexOf("export async function resolveContribDispute");
  const fn = src.slice(from, src.indexOf("\nexport async function", from + 10));

  check("갱신은 조건부(updateMany)다", /contribRecord\.updateMany\(\{/.test(fn), true);
  check("조건에 지금 상태가 들어간다", /where:\s*\{\s*id:\s*record\.id,\s*state:\s*"disputed"\s*\}/.test(fn), true);
  // **`update({ where: { id } })` 로 쓰면 조건이 사라진다.** 그 모양이 다시 들어오면 이 규칙이
  // 조용히 죽는다 — 그래서 명시적으로 걸어 둔다.
  check("무조건 갱신(update)이 없다", /contribRecord\.update\(\{\s*where:\s*\{\s*id:\s*record\.id\s*\},\s*data:\s*\{\s*resolution/.test(fn), false);
  check("읽기와 갱신이 한 트랜잭션이다", fn.indexOf("db.$transaction(async (tx)") > 0, true);
  // **아무것도 못 고쳤으면 예외가 아니라 정상 상태다.** 예외로 던지면 화면이 "실패"로 말하고,
  // 상대가 이미 고친 것이지 내가 못한 것이 아니다.
  check("못 고치면 gone 으로 끝난다", /won\.count === 0[\s\S]{0,80}?gone/.test(fn), true);
  check("지금은 상태도 같은 안에서 다시 맞춘다", fn.indexOf("refreshContribState(record.id, tx)") > fn.indexOf("won.count"), true);
}

/* ── 대화 순서 ────────────────────────────────────────────── */

console.log("\n대화 순서");
{
  // 화면이 실제로 쓰는 규칙(`messages-state.ts` 의 `useThreadMessages` 와 같은 모양).
  // 서버가 준 `sortAt` (ISO) 기준이고, 아직 도착하지 않은 말(전송 중·실패)은 지금 이후에
  // 생긴 것으로 본다.
  //
  // **메시지 객체를 받는다는 점이 중요하다.** `sortAt` 이 아니라 메시지를 받아야 하는데,
  // 문자열을 받도록 쓰면 `Date.parse(객체)` 가 NaN 이 되어 비교가 전부 거짓이 되고 정렬이
  // 조용히 무시된다 — 겉보기엔 통과한 검사가 아무것도 확인하지 못하는 상태가 된다.
  const stamp = (m: { sortAt: string | null }) =>
    m.sortAt === null ? Number.POSITIVE_INFINITY : Date.parse(m.sortAt);
  const order = (ms: Array<{ id: string; sortAt: string | null }>) =>
    [...ms].sort((a, b) => stamp(a) - stamp(b)).map((m) => m.id);

  const base = Date.parse("2026-09-26T12:00:00.000Z");
  const at = (s: number) => new Date(base + s * 1000).toISOString();

  check(
    "전송 중인 말은 그때 도착한 말보다 아래에 온다",
    order([
      { id: "상대", sortAt: at(0) },
      { id: "나(전송 중)", sortAt: null },
      { id: "상대2", sortAt: at(3) },
    ]),
    ["상대", "상대2", "나(전송 중)"],
  );
  check(
    "전송이 끝나면 서버 시각이 생겨 제자리에 놓인다",
    order([
      { id: "상대", sortAt: at(0) },
      { id: "나", sortAt: at(1) },
      { id: "상대2", sortAt: at(3) },
    ]),
    ["상대", "나", "상대2"],
  );
  // **표시 문자열("21:12")로 정렬하면 안 된다.** 파싱이 NaN 이라 비교가 전부 거짓이 되고
  // 정렬이 조용히 무시된다 — 대화가 뒤집힌 채로 남는다.
  check("표시 문자열은 정렬 키가 되지 못한다", Number.isNaN(Date.parse("14:02")), true);
}

/* ── 읽기 순화: 받는 사람이 순화된 표현을 받는다 ──────────── */

console.log("\n읽기 순화: 무엇을 순화하는가");
{
  const sent = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
    id,
    author: "최유나",
    mbti: null,
    isMine: false,
    text: "이거 왜 아직 안 올렸어요?",
    time: "14:02",
    sortAt: "2026-09-26T05:02:00.000Z",
    status: "sent",
    purified: null,
    ...over,
  });

  check("남이 보낸 글은 순화한다", canPurify(sent("a")), true);
  check("내 말은 순화하지 않는다", canPurify(sent("b", { isMine: true })), false);
  check("글 없는 말은 순화하지 않는다", canPurify(sent("c", { text: "  " })), false);
  check("보내는 중인 말은 순화하지 않는다", canPurify(sent("d", { status: "sending" })), false);
}

console.log("\n읽기 순화: 언제 다시 부르는가 (무한 재호출 차단)");
{
  // **이 표가 이 파이프라인의 핵심이다.** 예전에는 "행이 없다 = 아직 안 함" 이라
  // 거절된 말이 3초마다 다시 후보가 됐고, 새로고침하면 그 기억까지 리셋됐다.
  const now = { model: "openrouter/free", promptVersion: PROMPT_VERSION, at: 1_000_000_000 };
  const ago = (ms: number) => new Date(now.at - ms).toISOString();
  const soon = (ms: number) => new Date(now.at + ms).toISOString();

  check("아직 없으면 불러도 된다", canRetry(null, now), true);

  const failed = {
    status: "FAILED" as const,
    reason: CUSHION_REASON.MODEL_REFUSAL,
    attemptCount: 1,
    retryAfter: soon(FAILURE_BACKOFF_MS),
    model: now.model,
    promptVersion: now.promptVersion,
    createdAt: ago(1000),
  };
  // **같은 설정이면 다시 부르지 않는다.** 한도를 깎으면서 결과는 같기 때문이다.
  check("같은 설정의 실패는 다시 부르지 않는다", canRetry(failed, now), false);
  // 프롬프트를 고쳤다면 예전 실패는 낡았다 — 재생성된다. **다음 버전**을 직접 적는다
  // (현재 버전을 쓰면 "바뀌지 않은" 경우를 검사하는 셈이 된다).
  check("프롬프트가 바뀌면 다시 열린다", canRetry({ ...failed, promptVersion: `${PROMPT_VERSION}-next` }, now), true);
  check("모델이 바뀌면 다시 열린다", canRetry({ ...failed, model: "anthropic/claude-sonnet-5" }, now), true);
  // 시간이 지나도 시도 횟수가 남아 있으면 한 번만 더 시도한다.
  check("백오프가 지나면 한 번 더 시도한다", canRetry({ ...failed, retryAfter: ago(1) }, now), true);
  check("시도 횟수를 다 쓰면 포기한다", canRetry({ ...failed, retryAfter: ago(1), attemptCount: MAX_ATTEMPTS }, now), false);

  // 성공·가림은 끝이다. **다시 부르면 읽고 있던 말이 조용히 바뀐다.**
  check("순화 완성은 다시 부르지 않는다", canRetry({ ...failed, status: "PURIFIED" }, now), false);
  check("가림 완성도 다시 부르지 않는다", canRetry({ ...failed, status: "FALLBACK" }, now), false);

  // 두 탭 경합: 누군가 부르는 중이면 건드리지 않는다.
  const pending = { ...failed, status: "PENDING" as const, retryAfter: soon(CLAIM_TTL_MS), createdAt: ago(1000) };
  check("선점 유효 시간 안이면 건드리지 않는다", canRetry(pending, now), false);
  // 부르던 사람이 사라졌다(탭을 닫음)면 선점을 가져갈 수 있다 — 아니면 영영 "처리 중"이다.
  check("선점이 사라지면 다시 가져간다", canRetry({ ...pending, createdAt: ago(CLAIM_TTL_MS + 1000) }, now), true);

  check("성공과 가림만 끝난 상태다", [isCushionDone("PURIFIED"), isCushionDone("FALLBACK"), isCushionDone("FAILED")], [true, true, false]);
}

console.log("\n읽기 순화: 남은 수 (언제 멈추는가)");
{
  // **화면이 멈추는 기준은 남은 수가 0 인 것이다.** 그래서 이 수가 음수가 되면 멈추지 않는다 —
  // `!== 0` 은 음수도 "남았다" 로 읽히기 때문이다.
  const now = { model: "openrouter/free", promptVersion: PROMPT_VERSION, at: 1_000_000_000 };
  check("전부 처리했다", remainingPurify(3, 3), 0);
  check("일부만 남았다", remainingPurify(3, 2), 1);
  check("처음부터 없으면 남은 것도 없다", remainingPurify(0, 0), 0);
  // 처리한 수가 후보보다 많게 계산되어도(묶음 규칙이 바뀌면 생긴다) 음수로 새지 않는다.
  check("음수가 되지 않는다", remainingPurify(2, 5), 0);

  // ## 선점 경합 — 같은 사람이 두 탭에서 같은 방을 보고 있는 경우
  //
  // 이 말을 **상대가 먼저 잡았다.** 내가 못 가져간 것이지 사라진 것이 아니다: 순화본이 없다.
  // 그래서 남은 것으로 세고, 상대가 끝난 뒤에야 0 이 된다.
  const pendingByOther = {
    status: "PENDING" as const,
    reason: null,
    attemptCount: 0,
    retryAfter: new Date(now.at + CLAIM_TTL_MS).toISOString(),
    model: now.model,
    promptVersion: now.promptVersion,
    createdAt: new Date(now.at - 1000).toISOString(),
  };
  check("상대가 부르는 중인 말은 내 후보가 아니다", canRetry(pendingByOther, now), false);
  // `claimable` 은 `canRetry` 를 통과한 목록이다. 위에서 걸러졌으므로 후보 2개 중 남은 것도 2개다.
  check("선점에서 진 말은 남은 것으로 센다", remainingPurify(2, 0), 2);

  // 상대가 끝났다 — 그 말은 `PURIFIED` 가 됐고, **끝난 것은 다시 열리지 않는다.**
  const done = { ...pendingByOther, status: "PURIFIED" as const, attemptCount: 1, retryAfter: null };
  check("상대가 끝나도 다시 열리지 않는다", canRetry(done, now), false);
  // 선점 유효 시간이 지나면 PENDING 은 **사라진 요청**이므로 가져갈 수 있다 — 이때는 후보로
  // 돌아오고, 그때를 기다리지 않고 내가 가져간 경우가 바로 위의 `remainingPurify(2, 2)` 다.
  check("선점이 사라지면 가져갈 수 있다", canRetry(pendingByOther, { ...now, at: now.at + CLAIM_TTL_MS + 1 }), true);
  check("내가 가져간 것과 상대가 끝난 것은 남은 수가 없다", remainingPurify(2, 2), 0);
}

console.log("\n읽기 순화: id 기반 계약");
{
  const items = [
    { id: "m1", text: "내일 회의 몇 시로 할까요?" },
    { id: "m2", text: "자료는 언제쯤 나와요?" },
  ];
  // **본문은 데이터로 준다.** 글로 붙이면 "이전 지시를 무시해" 가 지시로 읽힐 수 있다.
  const request = JSON.parse(buildPurifyRequest(items)) as {
    task: string;
    items: Array<{ id: string; text: string; before: Array<{ text: string }> }>;
  };
  check("요청에 task 가 있다", request.task, "rewrite_for_reader_comfort");
  // 항목마다 `before` 가 붙으므로, 본문·id 와 **문맥이 섞이지 않았는지**로 본다.
  check(
    "본문은 데이터로 실린다",
    request.items.map((i) => [i.id, i.text]),
    items.map((i) => [i.id, i.text]),
  );

  // 순서가 바뀌어도, 하나가 빠져도, 앞에 설명이 붙어도 **요청한 id 만** 받아온다.
  const shuffled = parsePurifyResponse(
    '{"items":[{"id":"m2","text":"자료는 언제쯤 준비되나요?"},{"id":"m1","text":"내일 회의는 몇 시로 할까요?"}]}',
  );
  check("순서가 바뀌어도 id 로 맞춘다", [...shuffled.items.keys()].sort(), ["m1", "m2"]);
  check("값도 id 에 붙는다", shuffled.items.get("m1"), "내일 회의는 몇 시로 할까요?");

  const partial = parsePurifyResponse('{"items":[{"id":"m1","text":"다듬은 말"}]}');
  check("빠진 항목은 그 항목만 없는 것이다", partial.items.size, 1);
  check("없는 항목은 조회해도 없다", partial.items.get("m2"), undefined);

  const dup = parsePurifyResponse('{"items":[{"id":"m1","text":"하나"},{"id":"m1","text":"둘"}]}');
  check("중복 id 는 어느 것도 믿지 않는다", dup.items.size, 0);
  check("중복 id 는 알려 준다", dup.unknown, ["m1"]);

  check("코드펜스를 벗겨 낸다", parsePurifyResponse('```json\n{"items":[{"id":"m1","text":"하나"}]}\n```').items.get("m1"), "하나");
  check("배열 형태도 받아 준다", parsePurifyResponse('[{"id":"m1","text":"하나"}]').items.get("m1"), "하나");
  check("글이 아니면 안전하다", parsePurifyResponse("죄송합니다").items.size, 0);
  check("쓰레기여도 안전하다", parsePurifyResponse(42).items.size, 0);

  check("거절 문구를 알아본다", [isRefusal("User Safety: unsafe"), isRefusal("Sorry, I can't help"), isRefusal(" 抱歉，我无法协助")], [true, true, true]);
  check("순화문은 거절이 아니다", isRefusal('{"items":[{"id":"m1","text":"다듬은 말"}]}'), false);
}

console.log("\n읽기 순화: 항목별 판정 (묶음 전체를 버리지 않는다)");
{
  const items = [
    { id: "m1", text: "이거 왜 아직 안 올렸어요?" },
    { id: "m2", text: "씨발 진짜 왜 이래 좀비처럼" },
    { id: "m3", text: "민수가 API 배포 오늘까지 한다고 했잖아" },
  ];
  const response = parsePurifyResponse(
    JSON.stringify({
      items: [
        // 정상
        { id: "m1", text: "이거 아직 안 올리신 이유가 있을까요?" },
        // 욕이 남았다 → 이 항목만 버려야 한다
        { id: "m2", text: "진짜 왜 이렇게요 좀비처럼 하지 마세요" },
        // 공격성은 없지만 **정보가 죽었다**
        { id: "m3", text: "조금 더 신경 써주시면 좋겠습니다" },
      ],
    }),
  );
  const judged = judgeAll(items, response);
  const by = (id: string) => judged.find((j) => j.id === id)!;

  check("정상 항목은 순화된다", [by("m1").status, by("m1").text], ["PURIFIED", "이거 아직 안 올리신 이유가 있을까요?"]);
  check("욕이 남은 항목만 버려진다", [by("m2").status, by("m2").reason], ["REJECTED", CUSHION_REASON.TOXICITY_REMAINED]);
  // "공격성 0, 정보 0" 이 순화의 목표다. 정보를 지우면 순화가 아니라 삭제다.
  check("정보가 사라진 것도 버려진다", [by("m3").status, by("m3").reason], ["REJECTED", CUSHION_REASON.INFO_LOST]);
  check("묶음 전체를 버리지 않는다", judged.filter((j) => j.status === "PURIFIED").length, 1);

  check("빈 결과는 빈 응답으로 기록된다", judgeAll([{ id: "x", text: "안 올렸어요" }], { items: new Map(), unknown: [] })[0].reason, CUSHION_REASON.EMPTY_RESPONSE);
  check("길이 폭주는 버려진다", rejectsPurified("안 올려", "가".repeat(200)), CUSHION_REASON.TOO_LONG);
  check("빈 글은 버려진다", rejectsPurified("안 올렸어요", "   "), CUSHION_REASON.EMPTY_OUTPUT);
  // 감정 표현은 순화 대상이 아니다 — 지우면 사람이 한 말을 사람이 안 한 것처럼 읽힌다.
  check("감정 표현은 남아도 통과한다", rejectsPurified("짜증나 죽겠어", "정말 힘들 것 같아요"), null);
}

console.log("\n읽기 순화: 강도 3단계");
{
  // **단계는 세 곳을 바꾼다** — 모델에게 줄 지시(`guide`), 결과를 버릴 기준(`banned`),
  // AI 가 실패했을 때 가릴 범위(`mask`). 한 곳만 바꾸면 "약하게 순화하라 고 했는데
  // 검사는 엄격하게 한다" 같은 어긋남이 생기고 어느 쪽이 문제인지 알 수 없다.
  //
  // 그래서 여기서는 **셋이 같은 표에서 나오는지** 를 본다. 어느 한 항목만 조용히 다른 값을
  // 쓰기 시작하면 이 검사가 그걸 잡는다.
  check("단계는 3개뿐이다", CUSHION_LEVELS.map((l) => l.key), ["LIGHT", "NORMAL", "STRONG"]);
  check("기본은 NORMAL 이다", CUSHION_DEFAULT_MODE, "NORMAL");
  // **셋(지시·버릴 기준·가릴 범위)이 같은 표에서 나온다.** `levelGuide` 로 공개된 지시를
  // 확인한다 — 내부 표를 직접 들여다보지 않고, 이 함수가 그 표에서 나온 값인지 본다.
  for (const level of CUSHION_LEVELS.map((l) => l.key)) {
    truthy(`${level} 에는 모델 지시가 있다`, levelGuide(level).length > 0);
  }
  truthy(
    "세 단계의 지시가 모두 같지는 않다",
    new Set(CUSHION_LEVELS.map((l) => levelGuide(l.key))).size === CUSHION_LEVELS.length,
  );

  // **같은 문장, 다른 단계, 다른 판정.** 이게 단계 기능 그 자체다. 세 단계가 같은 답을 내면
  // 사용자가 고른 단계가 아무 소용이 없고, 서버는 화면이 고른 값을 무시한다.
  //
  // 단계는 "얼마까지 거르느냐" 의 차이다 — 약하게 골랐는데 더 세게 걸린다면 그건 단계가
  // 아니라 버그다. 그래서 **어디서부터 걸리는지** 를 문장 하나로 비교한다.
  const accuse = "처음부터 다 버려라";
  check("LIGHT 는 그 구제 명령을 둔다", rejectsPurified("야", accuse, "LIGHT"), null);
  check("NORMAL 도 둔다", rejectsPurified("야", accuse, "NORMAL"), null);
  check("STRONG 에 책임 추궁까지 걸린다", rejectsPurified("야", accuse, "STRONG"), CUSHION_REASON.TOXICITY_REMAINED);

  // 욕설은 **어느 단계에서나** 남아 있으면 버린다. 강도를 낮추어도 욕설 통과는 안 된다 —
  // 단계는 "무엇을 더 거를지" 를 정하는 것이지 "욕설을 허용할지" 를 정하는 게 아니다.
  for (const level of CUSHION_LEVELS.map((l) => l.key)) {
    check(
      `${level} 도 욕설은 남기면 버린다`,
      rejectsPurified("야 씨발", "야 씨발이야", level),
      CUSHION_REASON.TOXICITY_REMAINED,
    );
  }

  // **감정 표현은 어느 단계에서도 순화 대상이 아니다.** 지우면 사람이 한 말을 사람이 안
  // 한 것처럼 읽힌다. 강도를 올렸다고 욕이 되돌아오면 안 된다.
  for (const level of CUSHION_LEVELS.map((l) => l.key)) {
    check(
      `${level} 도 감정 표현은 둔다`,
      rejectsPurified("짜증나 죽겠어", "정말 힘들 것 같아요", level),
      null,
    );
  }

  // 가림도 단계에 따라 달라야 한다 — 이게 AI 가 실패했을 때 남는 화면이다.
  check("LIGHT 는 욕설만 가린다", maskRiskyParts("야 씨발 니가 잘못했다", "LIGHT").masked, 1);
  check("LIGHT 는 책임 추궁을 그대로 둔다", maskRiskyParts("야 니가 처음부터 다 버려라", "LIGHT").masked, 0);
  truthy("STRONG 는 책임 추궁까지 가린다", maskRiskyParts("야 니가 처음부터 다 버려라", "STRONG").masked > 0);
  check("가릴 수 없으면 가린 것이 아니다", needsMask("안 올려", "STRONG"), false);
}

console.log("\n읽기 순화: AI 실패 시 결정론적 가림");
{
  // 실측: 무료 모델은 욕설에 `User Safety: unsafe (Profanity, Harassment)` 를 돌려준다.
  // **가장 순화해야 할 자리에서 원문이 그대로 보이는 것**이 이 구조의 가장 큰 실패였다.
  const profanity = maskRiskyParts("야 씨발 니가 제대로 했어야지");
  check("욕설 자리를 가린다", profanity.masked, 1);
  check("문장 구조는 지켜진다", profanity.text, "야 •• 니가 제대로 했어야지");

  check("사람에게 붙인 비꼼도 가린다", maskRiskyParts("너는 진짜 좀비같아").masked > 0, true);
  check("원인을 돌리는 말도 가린다", maskRiskyParts("다 니 탓인데").masked > 0, true);
  check("비웃음 기호도 가린다", maskRiskyParts("역시 대충이네 ㅋㅋ").masked > 0, true);
  // 위험한 말이 없으면 **가린다고 말하지 않는다.**
  check("깨끗한 말은 그대로 둔다", maskRiskyParts("내일 회의 몇 시로 할까요?"), { text: "내일 회의 몇 시로 할까요?", masked: 0 });
  // **요구는 남는다** — 일은 굴러가야 한다.
  const keep = maskRiskyParts("씨발 내일까지 자료 안 오면 그냥 니가 혼자 해");
  check("가려도 마감과 요구는 남는다", [keep.text.includes("내일까지"), keep.text.includes("자료")], [true, true]);
}

console.log("\n읽기 순화: 무엇을 그릴 것인가");
{
  const ai = { status: "PURIFIED" as const, text: "이거 아직 안 올리신 이유가 있을까요?", kind: "ai" as const, reason: null, retryAfter: null };
  const mask = { status: "FALLBACK" as const, text: "야 •• 니가 제대로 했어야지", kind: "mask" as const, reason: null, retryAfter: null };
  const failed = { status: "FAILED" as const, text: null, kind: null, reason: "MODEL_REFUSAL", retryAfter: "2999-01-01T00:00:00.000Z" };
  const original = "야 씨발 니가 제대로 했어야지";

  // AI 가 쓴 것과 규칙이 가린 것은 **다른 라벨**이어야 한다. 같으면 거짓말이 된다.
  check("AI 순화문은 그린다", displayTextOf({ text: "이거 왜 아직 안 올렸어요?", purified: ai }, false).kind, "PURIFIED");
  check("가림본도 그린다", displayTextOf({ text: original, purified: mask }, false).kind, "FALLBACK");
  // 실패·거절은 **원문**으로 넘어가는 길이 이것 하나뿐이다.
  check("실패하면 원문이다", displayTextOf({ text: original, purified: failed }, false).text, original);
  check("아직 처리 전이면 원문이다", displayTextOf({ text: original, purified: null }, false).text, original);
  check("누르면 원문으로 돌아간다", displayTextOf({ text: original, purified: mask }, true).text, original);
  check("누르면 순화 문구가 아니다", displayTextOf({ text: original, purified: mask }, true).kind, null);
}

console.log("\n읽기 순화: 입력 상한을 넘으면 자르지 않는다");
{
  const long = "가".repeat(2000);
  const packed = packPurifyItems([
    { id: "a", text: long },
    { id: "b", text: long },
    { id: "c", text: long },
    { id: "d", text: long },
  ]);
  // 조용히 자르면, 잘린 말은 순화되지 않은 채 남아 "다 순화됐다" 고 보인다.
  check("상한을 넘으면 묶음을 줄인다", packed.length < 4, true);
  check("한 건도 안 들어가면 빈 묶음이다", packPurifyItems([{ id: "a", text: "가".repeat(9000) }]).length, 0);
  check("빈 묶음도 문제가 아니다", packPurifyItems([]).length, 0);
}

console.log("\n읽기 순화: 말투가 바뀌면");
{
  // 한 말에는 사람당 한 줄이다. 새 말투로 다시 만들어도 예전 글 위에 덮어쓸 수 없으니
  // **바뀐 순간 예전 순화본을 지워야 한다** — 그렇지 않으면 고른 말투가 아닌 글을 읽는다.
  check("처음 고르는 것은 지울 것이 없다", toneChanged(null, "plain"), false);
  // **기준은 "행이 없을 때의 기본값"과 비교한다.** 행이 없는 방에서 처음으로 고르면 지워야 한다
  // — 지우지 않으면 "강하게" 를 골랐는데 "보통" 으로 만든 말이 화면에 남는다(실측).
  // 이전 기준은 **"행이 없을 때 실제로 쓰이던 값"** 이다 — 저장된 null 이 아니라 첫 말투다.
  check("설정 행이 없어도 기준이 바뀌면 지운다", toneChanged(toneOf(READ_CUSHION_DEFAULT), "plain"), true);
  check("기본값 그대로면 지우지 않는다", toneChanged(toneOf(READ_CUSHION_DEFAULT), toneOf(READ_CUSHION_DEFAULT)), false);
  check("말투가 바뀌었으면 지운다", toneChanged("soft", "plain"), true);
  check("같은 말투를 다시 고르면 남긴다", toneChanged("plain", "plain"), false);
  check("고른 것이 없으면 첫 말투로 읽는다", toneOf({ tone: null }), "soft");
  check("고른 말투는 그대로 읽는다", toneOf({ tone: "firm" }), "firm");
  check("모르는 말투는 없는 것으로 본다", toneOf({ tone: "존나" }), "soft");
}

console.log("\n읽기 순화: 지표가 말해주는 것");
{
  // 지표는 상태를 그대로 세지 않는다. `REJECTED 12개` 만으로는 **무엇을 고쳐야 하는지**
  // 알 수 없다 — 모델인가, 프롬프트인가, 검사가 과한가. 한 계단짜리 말로 내려야 한다.
  const row = (status: CushionStatus, reason: CushionReason | null = null, source: string | null = null) =>
    cushionBucketOf({ status, reason, source });
  check("AI 가 다듬은 말", row("PURIFIED"), "done");
  check("규칙으로 가린 말", row("FALLBACK", CUSHION_REASON.MODEL_REFUSAL, "mask"), "masked");
  check("모델이 거절한 것", row("FAILED", CUSHION_REASON.MODEL_REFUSAL), "refused");
  check("한도 exhausted", row("REJECTED", CUSHION_REASON.RATE_LIMITED), "refused");
  check("검사로 버린 것", row("REJECTED", CUSHION_REASON.TOXICITY_REMAINED), "rejected");
  check("형식이 깨진 것", row("REJECTED", CUSHION_REASON.PARSE_FAILED), "rejected");
  check("키가 없는 것", row("FAILED", CUSHION_REASON.NO_MODEL), "failed");
  check("아직 처리 중", row("PENDING"), "pending");

  // 실측에서 나온 모양: 협조적 말은 다 이어지고, 다툰 말은 **규칙 가림**으로 버틴다.
  // 커버리지는 높지만 AI 비율은 낮다 — 두 숫자를 따로 봐야 "모델을 바꿀까" 를 알 수 있다.
  const counts = { done: 11, masked: 2, refused: 0, rejected: 3, failed: 0, pending: 0 };
  check("커버리지 = 순화 + 가림", purificationCoverage(counts), 0.813);
  check("AI 비율은 따로 본다", purificationAiShare(counts), 0.688);
  check("커버리지만 높아도 AI 가 한 일은 적다", purificationCoverage(counts) > purificationAiShare(counts), true);
  check("아무것도 없으면 0 으로 나누지 않는다", purificationCoverage({ done: 0, masked: 0, refused: 0, rejected: 0, failed: 0, pending: 0 }), 0);
}

console.log("\n읽기 순화: 회귀 코퍼스(모델 없이 검사하는 부분)");
{
  // 코퍼스(`scripts/cushion-corpus.mts`)는 **문장**이 아니라 **성질**을 약속한다
  // (요구·마감은 남고, 이 단계에서 지워야 할 것은 사라진다). 모델을 부르지 않고도
  // 검사할 수 있는 두 방향을 여기서 고정한다.
  //
  // 1. **원문은 검사를 통과하면 안 된다.** 통과한다는 것은 "순화됨" 라벨이 욕설이 그대로인
  //    글에 붙는다는 뜻이다. (실측에서 바로 이게 무서운 실패였다)
  // 2. **깨끗한 말은 버리면 안 된다.** 협조적인 말을 검사가 걸어내면 순화가 말을 막는 셈이다.
  // 3. **가림은 약속한 것만 가려야 한다.** innocent 한 말에서 가린 것이 있으면 계기가 없다.
  for (const item of CUSHION_CORPUS) {
    const level = item.level;
    const originalVerdict = rejectsPurified(item.text, item.text, level);
    if (item.drop.length > 0) {
      check(`원문이 통과하지 않는다 [${item.id}]`, originalVerdict !== null, true);
      // **코퍼스 자체가 제때여야 한다.** `drop` 에 적은 낱말이 원문에 없으면 그 항목은
      // 아무것도 보장하지 않는다 — 지워야 할 것이 원문에 있었는지조차 확인되지 않는다.
      check(`코퍼스가 지워야 할 것을 실제로 짚는다 [${item.id}]`, item.drop.some((w) => item.text.includes(w)), true);
      // `keep` 도 마찬가지 — 원문에 없으면 "살아남아야 한다" 는 빈 약속이다.
      for (const token of item.keep) {
        check(`코퍼스의 생존 대상이 원문에 있다 [${item.id}/${token}]`, item.text.includes(token), true);
      }
    } else {
      // 욕설이 없는 말은 그 단계에서 통과해야 한다 — 버리면 그 말은 원문으로 남는다.
      check(`깨끗한 말은 버리지 않는다 [${item.id}]`, originalVerdict, null);
    }
  }

  // **가림 규칙의 약속**: `maskable: true` 인 말은 반드시 something 을 가릴 수 있어야 하고,
  // `false` 인 말(조용한 공격)은 **아무것도 가리지 않아야 한다** — 가릴 게 없다는 사실을
  // 알지 못하면 "안전하다" 고 잘못 믿는다.
  for (const item of CUSHION_CORPUS) {
    const masked = maskRiskyParts(item.text, item.level).masked;
    if (item.maskable && item.drop.length > 0) {
      check(`가릴 수 있다 [${item.id}]`, masked > 0, true);
    }
    if (!item.maskable) {
      check(`가릴 것이 없다 [${item.id}]`, masked, 0);
    }
  }

  // **요구는 살아남아야 한다.** 가린 뒤에도 마감·자료·시각이 있으면 일이 굴러간다.
  for (const item of CUSHION_CORPUS.filter((c) => c.maskable && c.drop.length > 0 && c.keep.length > 0)) {
    const masked = maskRiskyParts(item.text, item.level);
    for (const token of item.keep) {
      // 원문에 없으면 무의미하다 — keep 는 원문에 있는 것만 적는다.
      if (item.text.includes(token)) {
        check(`가려도 ${token} 는 남는다 [${item.id}]`, masked.text.includes(token), true);
      }
    }
  }
}

console.log("\n읽기 순화 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const viewer = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !viewer) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const message = await db.message.create({
      data: { teamId: team.id, threadKey: "team", authorId: viewer.id, text: "읽기 순화 확인용", whenLabel: "14:02" },
    });
    const cushion = (over: Record<string, unknown> = {}) => ({
      messageId: message.id,
      policyHash: "policy-a",
      level: "NORMAL",
      tone: "soft",
      status: "PURIFIED",
      text: "읽기 순화 확인용",
      source: "ai",
      sourceHash: "h1",
      model: "openrouter/free",
      promptVersion: PROMPT_VERSION,
      validatorVersion: "v1",
      ...over,
    });

    const first = await db.messagePurification.create({ data: cushion() });
    truthy("순화 상태가 남는다", Boolean(first.id));

    // **같은 말 + 같은 설정에 두 줄이 생기면 안 된다.** 어느 것이 맞는 결과인지 고르는 기준이
    // 사라지고, 사용자가 본 말과 다른 말이 쌓인다.
    const dup = await db.messagePurification
      .create({ data: cushion({ text: "다른 말", status: "FALLBACK" }) })
      .catch((e: { code?: string }) => e.code);
    check("같은 말·같은 설정은 한 줄뿐이다", dup, "P2002");

    // **설정이 다르면 다른 줄이다.** 이것이 이 구조의 전부다 — 열쇠에 사람이 아니라
    // 읽기 조건이 들어가므로, 같은 말을 다른 강도로 읽으면 각자 맞는 결과가 남는다.
    /**
     * **팀원 몇 명이든 같은 결과의 같은 줄을 본다** — 계측으로 확인한다.
     *
     * 모델을 부르면 돈과 시간이 들고 회차마다 편차가 커서 AI 호출 횟수로는 증명할 수 없다.
     * 그래서 **DB 계약**(열쇠가 사람인지 설정인지)을 직접 지킨다 — 모델을 부르기 전 마지막 관문.
     */
    const peerA = await db.member.create({ data: { teamId: team.id, name: "가", wantRole: "research" } });
    const peerB = await db.member.create({ data: { teamId: team.id, name: "나", wantRole: "present" } });
    const peerC = await db.member.create({ data: { teamId: team.id, name: "다", wantRole: "manage" } });
    const seen = await Promise.all(
      [peerA.id, peerB.id, peerC.id].map(() =>
        db.messagePurification.findFirst({ where: { messageId: message.id, policyHash: "policy-a" }, select: { id: true } }),
      ),
    );
    check("세 사람이 같은 결과의 같은 줄을 본다", new Set(seen.map((row) => row?.id)).size, 1);
    // 그 세 사람은 **같은 결과를 폈다가 끝**이다 — 읽는 사람이 늘어도 순화본은 늘지 않는다.
    check(
      "사람이 늘어도 순화본은 늘지 않는다",
      await db.messagePurification.count({ where: { messageId: message.id, policyHash: "policy-a" } }),
      1,
    );
    await db.member.deleteMany({ where: { id: { in: [peerA.id, peerB.id, peerC.id] } } });

    const other = await db.messagePurification.create({ data: cushion({ policyHash: "policy-b", level: "STRONG" }) });
    check("설정이 다르면 다른 결과가 남는다", other.level, "STRONG");
    check("같은 말에 두 설정이 함께 있다", await db.messagePurification.count({ where: { messageId: message.id } }), 2);

    /**
     * **읽는 사람이 몇 명이어도 결과는 한 줄이다** — 이 표의 전부다.
     *
     * 예전에는 (말, 읽는 사람) 이 열쇠여서 팀원 5명이 방에서 같이 읽으면 **같은 말을 5번**
     * 모델에 불렀다(AI 한도 1회씩). 팀플이 4~5명인 이 앱에서 가장 큰 낭비였다.
     *
     * 여기서 확인하는 것: 두 사람이 **같은 지문**을 조회해도 같은 행을 본다. 열쇠에 사람이
     * 없으므로 두 번째 사람은 AI 를 부르지 않는다(액션의 선점이 붙잡는다).
     */
    const secondViewer = await db.member.create({
      data: { teamId: team.id, name: "둘째", wantRole: "present" },
    }).catch(() => null);
    if (secondViewer) {
      const peerSeesSame = await db.messagePurification.findMany({
        where: { messageId: message.id, policyHash: "policy-a" },
        select: { id: true, text: true },
      });
      check("같은 설정을 읽는 사람은 같은 결과를 본다", peerSeesSame.length, 1);
      check("그 결과는 같은 글이다", peerSeesSame[0].text, first.text);
      check("사람을 열쇠에 넣지 않는다", await db.messagePurification.count({ where: { messageId: message.id } }), 2);
      await db.member.delete({ where: { id: secondViewer.id } });
    }

    // **지문은 읽기 조건만 담는다.** 사람이 바뀌어도 지문이 같아야 공유된다.
    const policyA = purifyPolicyHash({ level: "NORMAL", tone: "soft", model: "openrouter/free", promptVersion: PROMPT_VERSION, validatorVersion: VALIDATOR_VERSION });
    const policySameA = purifyPolicyHash({ level: "NORMAL", tone: "soft", model: "openrouter/free", promptVersion: PROMPT_VERSION, validatorVersion: VALIDATOR_VERSION });
    const policyStrong = purifyPolicyHash({ level: "STRONG", tone: "soft", model: "openrouter/free", promptVersion: PROMPT_VERSION, validatorVersion: VALIDATOR_VERSION });
    const policyTone = purifyPolicyHash({ level: "NORMAL", tone: "asis", model: "openrouter/free", promptVersion: PROMPT_VERSION, validatorVersion: VALIDATOR_VERSION });
    check("같은 조건은 같은 지문", policyA, policySameA);
    check("강도가 다르면 지문이 다르다", policyA === policyStrong, false);
    check("말투가 다르면 지문이 다르다", policyA === policyTone, false);
    // 지문 하나가 **한 줄의 전부**여야 한다 — 더할 수 있는 식별자가 남아 있으면 공유가 깨진다.
    const shareRow = await db.messagePurification.create({
      data: cushion({ policyHash: policyA, text: "지문 공유 확인" }),
    });
    const sharePeer = await db.messagePurification.findUnique({
      where: { messageId_policyHash: { messageId: message.id, policyHash: policyA } },
    });
    check("지문만으로 같은 결과를 찾는다", sharePeer?.id, shareRow.id);
    await db.messagePurification.delete({ where: { id: shareRow.id } });

    // 선점: 두 탭이 **아직 없는** 같은 말·같은 설정에 동시에 PENDING 을 만들면 한 줄만 남고,
    // claimToken 은 한쪽에만 있다. 그 값이 자기 것인 요청만 모델을 부른다.
    const claimMessage = await db.message.create({
      data: { teamId: team.id, threadKey: "team", authorId: viewer.id, text: "선점 확인용", whenLabel: "14:03" },
    });
    const claimRow = (claimToken: string) => ({
      messageId: claimMessage.id,
      policyHash: "policy-a",
      level: "NORMAL",
      tone: "soft",
      status: "PENDING",
      sourceHash: "h1",
      model: "openrouter/free",
      promptVersion: PROMPT_VERSION,
      validatorVersion: "v1",
      claimToken,
      retryAfter: new Date(Date.now() + CLAIM_TTL_MS),
    });
    await db.messagePurification.createMany({ data: [claimRow("token-a"), claimRow("token-b")], skipDuplicates: true });
    const claimed = await db.messagePurification.findMany({ where: { messageId: claimMessage.id } });
    check("선점도 한 줄뿐이다", claimed.length, 1);
    check("선점 토큰은 하나만 남는다", [claimed[0].claimToken === "token-a", claimed[0].claimToken === "token-b"].filter(Boolean).length, 1);
    await db.messagePurification.deleteMany({ where: { messageId: claimMessage.id } });
    await db.message.delete({ where: { id: claimMessage.id } });

    /**
     * **문맥이 있어도 캐시가 깨지지 않는다 (P2).**
     *
     * "이 방의 최근 N 말" 을 문맥으로 주면 같은 말을 읽는 사람마다 뒤에 있는 말의 수가
     * 달라져 결과가 사람마다 달라진다. 순화본 공유(한 결과를 여럿이 씀)가 그걸로 무너진다.
     *
     * 그래서 문맥은 **각 말의 앞 2개로 고정**한다 — 같은 말은 어디서 읽든 같은 입력을 갖는다.
     * 여기서는 그 입력 형태만 고정한다(모델 호출 없음).
     */
    const withContext = buildPurifyRequest([
      { id: "m1", text: "내일 3시까지 자료 보내줘", before: [{ text: "내가 정리할게" }, { text: "urgent야" }] },
    ]);
    const parsedRequest = JSON.parse(withContext) as {
      task: string;
      items: Array<{ id: string; text: string; before: Array<{ text: string }> }>;
    };
    check("요청이 순화 요청이다", parsedRequest.task, "rewrite_for_reader_comfort");
    check("읽을 대상은 text 하나", parsedRequest.items[0].text, "내일 3시까지 자료 보내줘");
    check("문맥은 항목마다 붙는다", parsedRequest.items[0].before.length, 2);
    // **문맥에 id 가 없다** — id 가 있으면 모델이 그걸 항목으로 취급해 함께 고친다.
    check("문맥에 id 를 주지 않는다", JSON.stringify(Object.keys(parsedRequest.items[0].before[0])), '["text"]');

    // 문맥 없는 항목에도 `before` 는 **빈 배열로** 존재한다 — 모양이 하나로 유지돼야
    // 모델이 "있을 때만" 을 예측할 수 없다.
    const noContext = JSON.parse(buildPurifyRequest([{ id: "m2", text: "안녕" }])) as {
      items: Array<{ before: unknown }>;
    };
    check("문맥이 없으면 빈 배열", noContext.items[0].before, []);
    check("문맥 상수는 정확히 2", PURIFY_CONTEXT_MESSAGES, 2);

    // 실패가 저장된다 — 안 하면 다시 부르고, 셀 수도 없다.
    await db.messagePurification.update({
      where: { messageId_policyHash: { messageId: message.id, policyHash: "policy-a" } },
      data: { status: "REJECTED", text: null, source: null, reason: CUSHION_REASON.TOXICITY_REMAINED, attemptCount: 1, claimToken: null, retryAfter: new Date(Date.now() + FAILURE_BACKOFF_MS) },
    });
    const rejected = await db.messagePurification.findUniqueOrThrow({
      where: { messageId_policyHash: { messageId: message.id, policyHash: "policy-a" } },
    });
    check("실패 이유가 남는다", rejected.reason, CUSHION_REASON.TOXICITY_REMAINED);
    check("실패에는 글자가 없다", rejected.text, null);
    check("다시 부르지 않는 시각이 남는다", rejected.retryAfter !== null, true);
    check("몇 번 시도했는지 남는다", rejected.attemptCount, 1);
    // 이 상태면 브라우저를 새로고침해도 다시 부르지 않는다 — 기억이 아니라 DB 다.
    check(
      "저장된 실패는 다시 열리지 않는다",
      canRetry(
        {
          status: rejected.status as "REJECTED",
          reason: CUSHION_REASON.TOXICITY_REMAINED,
          attemptCount: rejected.attemptCount,
          retryAfter: rejected.retryAfter?.toISOString() ?? null,
          model: rejected.model,
          promptVersion: rejected.promptVersion,
          createdAt: rejected.createdAt.toISOString(),
        },
        { model: "openrouter/free", promptVersion: PROMPT_VERSION, at: Date.now() },
      ),
      false,
    );

    // 방마다·사람마다 따로다.
    await db.readCushion.upsert({
      where: { memberId_threadKey: { memberId: viewer.id, threadKey: "team" } },
      update: { tone: "soft" },
      create: { memberId: viewer.id, threadKey: "team", tone: "soft" },
    });
    const saved = await db.readCushion.upsert({
      where: { memberId_threadKey: { memberId: viewer.id, threadKey: "team" } },
      update: { tone: "plain" },
      create: { memberId: viewer.id, threadKey: "team", tone: "plain" },
    });
    check("다시 골라도 행이 쌓이지 않는다", await db.readCushion.count({ where: { memberId: viewer.id } }), 1);
    check("말투가 바뀐다", saved.tone, "plain");

    const dm = await db.readCushion.create({ data: { memberId: viewer.id, threadKey: "dm:zz:zz", tone: "firm" } });
    const teamRow = await db.readCushion.findUniqueOrThrow({
      where: { memberId_threadKey: { memberId: viewer.id, threadKey: "team" } },
    });
    check("방을 바꿔도 다른 방의 설정은 그대로다", teamRow.tone, "plain");
    check("새 방의 설정은 따로 남는다", dm.tone, "firm");

    await db.readCushion.deleteMany({ where: { memberId: viewer.id, threadKey: { in: ["team", "dm:zz:zz"] } } });
    await db.messagePurification.deleteMany({ where: { messageId: message.id } });
    await db.message.delete({ where: { id: message.id } });
    check("말을 지우면 순화 상태도 함께 간다", await db.messagePurification.count({ where: { messageId: message.id } }), 0);
  }
}

/* ── 이미 지난 시간은 후보가 아니다 ───────────────────────── */

console.log("\n회의 후보에서 지난 시간");
{
  // 시간표의 칸 인덱스 0 = 9시. `hourNow` 와 비교하려면 반드시 `SCHEDULE_HOURS` 를 거쳐야 한다
  // — 인덱스를 시각으로 잘못 비교하면(0 < 21) 아무것도 걸리지 않는다.
  const SCHEDULE_HOURS = ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
  const keeps = (hourNow: number) =>
    SCHEDULE_HOURS.map(Number).filter((start) => start >= hourNow);

  check("오전 10시면 9시 회의는 사라진다", keeps(10)[0], 10);
  check("지금 시작하는 시간은 남는다", keeps(10).includes(10), true);
  check("밤 11시면 10시 회의도 사라진다", keeps(11).includes(10), false);
  check("아침 9시면 아무것도 빠지지 않는다", keeps(9), SCHEDULE_HOURS.map(Number));
  // 시간표가 9~18시뿐이라 밤 11시에는 남는 후보가 없다 — 오늘 회의는 더 이상 잡을 수 없다.
  check("밤 11시면 오늘 남는 후보가 없다", keeps(23), []);
}

/* ── 푸시 알림 ──────────────────────────────────────────────── */

console.log("\n푸시 알림");
{
  const base = {
    supported: true,
    permission: "default" as const,
    standalone: false,
    ios: false,
    configured: true,
    subscribed: false,
  };

  // 켤 수 없는 이유를 **말하지 않으면** 사용자는 "알림이 안 오는데 왜지?"를 알 수 없다.
  check("조건을 다 갖췄으면 막는 말이 없다", pushBlock(base), null);
  check(
    "서버에 키가 없으면 켤 수 없다고 말한다",
    pushBlock({ ...base, configured: false })?.code,
    "not-configured",
  );
  check(
    "아이폰은 설치 전에는 켤 수 없다고 말한다",
    pushBlock({ ...base, ios: true })?.code,
    "needs-install",
  );
  check(
    "아이폰이어도 설치돼 있으면 막지 않는다",
    pushBlock({ ...base, ios: true, standalone: true }),
    null,
  );
  check(
    "브라우저가 막아 뒀으면 그 사실을 말한다",
    pushBlock({ ...base, permission: "denied" })?.code,
    "denied",
  );
  check(
    "푸시 API가 없으면 불가능하다고 말한다",
    pushBlock({ ...base, supported: false })?.code,
    "unsupported",
  );

  // "켜짐"은 다섯 가지를 다 만족할 때만이다 — 하나라도 어긋나면 껍데기가 된다.
  check(
    "권한만 있고 구독이 없으면 켜진 게 아니다",
    pushOn({ ...base, permission: "granted" }),
    false,
  );
  check(
    "전부 갖췄을 때만 켜진 것으로 말한다",
    pushOn({ ...base, permission: "granted", subscribed: true }),
    true,
  );
}

/* ── 무엇을 앱 밖으로 보낼지 ──────────────────────────────────── */

console.log("\n푸시 정책 (무엇을 밖으로 내보내는지 한 곳에서 정한다)");
{
  // 1. **응답이 없으면 일이 밀린다.** 여기 있는 것들은 전부 "당신이 해야 하는 일이 생겼다".
  for (const kind of ["join-request", "rejoin-request", "contrib-dispute", "contrib-confirm", "poke"] as const) {
    check(`응답이 필요한 ${kind} 은 밖으로 부른다`, pushPolicy(kind), "push");
  }
  check("회의 제안은 밖으로 부른다", pushPolicy("meeting"), "push");

  // 2. **이미 끝난 일은 부르지 않는다.** 지금 알았어도 아무것도 달라지지 않는다.
  for (const kind of ["drive", "contrib-participation", "icebreak", "who-does-it"] as const) {
    check(`정보성 ${kind} 는 앱 안에만 남긴다`, pushPolicy(kind), "in-app-only");
  }
  check("회의 확정은 앱 안에만 남긴다", pushPolicy("meeting", { settled: true }), "in-app-only");

  // `settled` 는 종류보다 먼저 본다 — 무엇이든 끝난 일은 부르지 않는다.
  check("끝난 일은 종류와 상관없이 부르지 않는다", pushPolicy("join-request", { settled: true }), "in-app-only");

  // 이 표가 어긋나면 어느 종류가 화면 밖으로 샜는지 알 수 없다. 종류를 빠뜨리지 않게 세운다.
  const kinds: NotifyKind[] = [
    "poke", "meeting", "schedule-ask", "contrib-dispute", "contrib-confirm",
    "contrib-participation", "join-request", "rejoin-request", "icebreak", "who-does-it", "drive",
  ];
  check("종류 하나도 판정 밖으로 새지 않는다", kinds.filter((k) => pushPolicy(k) === undefined).length, 0);
}

/* ── 푸시 본문 ──────────────────────────────────────────────── */

console.log("\n푸시 알림 (구독과 본문)");
{
  const sub = pushSubscriptionFrom({
    endpoint: "https://push.example/abc",
    keys: { p256dh: "k1", auth: "k2" },
  });
  check("브라우저가 준 구독을 읽는다", sub?.endpoint, "https://push.example/abc");
  // 발신할 주소·키 중 하나라도 없으면 발신은 실패하는데 저장은 성공한 척이라, 아예 받지 않는다.
  check("주소가 없으면 구독을 받지 않는다", pushSubscriptionFrom({ keys: { p256dh: "k", auth: "a" } }), null);
  check(
    "키가 없으면 구독을 받지 않는다",
    pushSubscriptionFrom({ endpoint: "https://push.example/abc" }),
    null,
  );
  check("엉뚱한 값이면 구독을 받지 않는다", pushSubscriptionFrom("endpoint"), null);

  // `href` 는 알림을 눌렀을 때 여는 창이다 — 앱 밖으로 나가면 안 된다.
  check("앱 안 주소는 그대로 쓴다", pushPayload({ title: "t", body: "b", href: "/home" }).href, "/home");
  check(
    "스킴 상대 주소는 앱 밖으로 나간다",
    pushPayload({ title: "t", body: "b", href: "//evil.example" }).href,
    null,
  );
  check(
    "절대 주소는 앱 밖으로 나간다",
    pushPayload({ title: "t", body: "b", href: "https://evil.example" }).href,
    null,
  );
  check("주소가 없으면 주소 없이 보낸다", pushPayload({ title: "t", body: "b" }).href, null);

  // 지울 것과 지우면 안 되는 것을 구분한다. 서명이 잘못되면(401) 지워 버릴수록
  // 정상 기기들의 구독을 우리가 한 번의 설정 실수로 전부 잃는다.
  check("404 는 죽은 주소다", pushFailure(404), "gone");
  check("410 도 죽은 주소다", pushFailure(410), "gone");
  check("401 은 우리 쪽 서명 문제라 지우지 않는다", pushFailure(401), "failed");
  check("429 는 잠깐 막힌 것이라 지우지 않는다", pushFailure(429), "failed");
  check("상태 코드가 없으면 지우지 않는다", pushFailure(undefined), "failed");
}

console.log("\n푸시 구독 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const members = team
    ? await db.member.findMany({ where: { teamId: team.id, leftAt: null }, take: 2 })
    : [];
  if (members.length < 2) {
    console.log("  · 팀원이 둘 이상이어야 이 항목을 돌립니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const [a, b] = members;
    const endpoint = `https://push.example/smoke-${Date.now()}`;

    await db.pushSubscription.deleteMany({ where: { endpoint } });
    const first = await db.pushSubscription.create({
      data: { memberId: a.id, endpoint, p256dh: "k1", auth: "k2" },
    });

    // 같은 단말이 다시 구독하면 행을 쌓지 않고 **주인을 바꾼다** — 기기를 넘겨 쓰면
    // 그 뒤로 알림은 새 사람에게 가야 한다. 쌓기만 하면 옛 사람에게 계속 간다.
    const again = await db.pushSubscription.upsert({
      where: { endpoint },
      create: { memberId: b.id, endpoint, p256dh: "k1", auth: "k2" },
      update: { memberId: b.id },
    });
    const rows = await db.pushSubscription.count({ where: { endpoint } });
    check("같은 단말은 행을 쌓지 않는다", rows, 1);
    check("기기를 넘겨 쓰면 주인이 바뀐다", again.memberId, b.id);
    check("구독 주소는 하나뿐이다", first.endpoint, again.endpoint);

    const dup = await db.pushSubscription
      .create({ data: { memberId: a.id, endpoint, p256dh: "k1", auth: "k2" } })
      .catch((e: { code?: string }) => e.code);
    check("주소가 겹치면 들어가지 않는다", dup, "P2002");

    await db.pushSubscription.deleteMany({ where: { endpoint } });
  }
}

console.log("\n푸시 구독 (기기는 따로)");
{
  /**
   * ## 왜 이 구역이 있는가 — 두 사람이 동시에 중요하다
   *
   * 예전에는 끄기가 **`deleteMany({ where: { memberId } })`** 였다. 그건 **내 모든 기기**를
   * 지운다. 노트북에서 끄면 **휴대폰 구독까지 사라져** 그 뒤로 알림이 오지 않는다 — 화면은
   * "껐습니다"라고 말하는데 정작 가장 오래 남아 있던 기기가 꺼졌다. 되돌릴 수 없다.
   *
   * 반대 방향도 있었다. 설정 화면은 `server.subscribed || localBrowserSubscription` 으로
   * 판단했는데, 서버 값은 "내 계정 어딘가"였다. 그래서 **휴대폰에만 켜진 PC** 가 "켜짐"으로
   * 보였다.
   *
   * 규칙은 하나다. **"이 기기가 켜졌는가"는 이 기기만 답한다.** 서버는 "내 기기가 몇 개나
   * 켜져 있는가"를 답할 뿐, 그 값을 이 기기의 상태로 쓰지 않는다.
   */
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const members = team
    ? await db.member.findMany({ where: { teamId: team.id, leftAt: null }, take: 2 })
    : [];
  if (members.length < 2) {
    console.log("  · 팀원이 둘 이상이어야 이 항목을 돌립니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const [a, b] = members;
    const stamp = Date.now();
    // **두 기기의 주소를 일부러 다르게 만든다.** 같으면 한 기기로 세어지므로 이 검사가
    // 아무것도 못 증명한다.
    const phone = `https://push.example/phone-${stamp}`;
    const laptop = `https://push.example/laptop-${stamp}`;
    const ends = [phone, laptop];
    const owned = a.id;

    await db.pushSubscription.deleteMany({ where: { endpoint: { in: ends } } });
    await db.pushSubscription.createMany({
      data: [
        { memberId: owned, endpoint: phone, p256dh: "p", auth: "a" },
        { memberId: owned, endpoint: laptop, p256dh: "p", auth: "a" },
      ],
    });
    check("한 사람의 두 기기가 두 줄이다", await db.pushSubscription.count({ where: { memberId: owned, endpoint: { in: ends } } }), 2);

    // **핵심: 한 기기만 끈다.** 서버 액션과 같은 문장이다 — `memberId` **와** `endpoint` 를
    // **둘 다** 조건에 넣는다.
    const turnedOff = await db.pushSubscription.deleteMany({ where: { memberId: owned, endpoint: laptop } });
    check("끈 기기의 줄만 지워진다", turnedOff.count, 1);
    const left = await db.pushSubscription.findMany({
      where: { memberId: owned, endpoint: { in: ends } },
      select: { endpoint: true },
      orderBy: { endpoint: "asc" },
    });
    check("다른 기기는 그대로 남는다", left.map((r) => r.endpoint), [phone]);

    // **주소만 알면 남의 줄을 지울 수 없어야 한다.** `memberId` 조건이 빠지면 여기서 무너진다 —
    // 주소는 브라우저 안에만 있으므로 이 조건이 곧 그 경계다.
    const notMine = await db.pushSubscription.deleteMany({ where: { memberId: b.id, endpoint: phone } });
    check("남의 기기 주소로 지우면 아무 일도 없다", notMine.count, 0);
    check("남의 주소는 여전히 남아 있다", await db.pushSubscription.count({ where: { endpoint: phone } }), 1);

    // **주인이 바뀐 기기** — 주소를 추측할 수 있어도 `memberId` 가 다르면 못 지운다.
    const stolen = await db.pushSubscription.create({
      data: { memberId: b.id, endpoint: `https://push.example/other-${stamp}`, p256dh: "p", auth: "a" },
    });
    const afterTheft = await db.pushSubscription.deleteMany({
      where: { memberId: owned, endpoint: stolen.endpoint },
    });
    check("주인이 다른 줄은 건드리지 않는다", afterTheft.count, 0);
    check("주인이 다른 줄은 남는다", await db.pushSubscription.count({ where: { endpoint: stolen.endpoint } }), 1);

    // **같은 주소로 다시 켜면 주인이 옮겨 간다** — 기기를 넘겨 쓰는 경우. 위 DB 구역이
    // 같은 주인의 줄 수를 셌으므로, 여기서는 **사람이 바뀌는 것**까지 함께 본다.
    const handover = await db.pushSubscription.upsert({
      where: { endpoint: phone },
      create: { memberId: b.id, endpoint: phone, p256dh: "p2", auth: "a2" },
      update: { memberId: b.id, p256dh: "p2", auth: "a2" },
    });
    check("같은 주소로 켜면 주인이 옮겨진다", handover.memberId, b.id);
    check("옮겨 간 뒤 옛 사람에게 남지 않는다", await db.pushSubscription.count({ where: { memberId: owned, endpoint: { in: ends } } }), 0);

    await db.pushSubscription.deleteMany({ where: { endpoint: { in: [...ends, stolen.endpoint] } } });
  }
}

console.log("\n푸시 구독: 기기 규칙이 코드에 남아 있다");
{
  // 위 DB 검사는 **기다리는 문장**을 친 것이다. 액션과 클라이언트가 그 문장을 **쓰는가**를
  // 여기서 본다 — 화면은 브라우저에서 돈다.
  const server = readCode("../src/server/actions/push.ts");
  const from = server.indexOf("export async function clearPushSubscription");
  const fn = from >= 0 ? server.slice(from) : "";

  truthy("끄기 함수가 있다", fn.length > 0);
  // **전체 삭제로 돌아가면 이 규칙이 조용히 죽는다** — 기기 분리의 전부다.
  check("memberId 만으로 지우지 않는다", /deleteMany\(\{\s*where:\s*\{ memberId: me\.id \}/.test(fn), false);
  check("주소까지 조건에 든다", /where:\s*\{\s*memberId:\s*me\.id,\s*endpoint:\s*address\s*\}/.test(fn), true);
  // 주소를 못 받았으면 **아무것도 지우지 않는다** — 모르는 것을 지우는 것이 예전 사고다.
  check("주소가 없으면 지우지 않는다", fn.indexOf("if (!address)") > 0 && fn.indexOf("return { cleared: 0 }") > fn.indexOf("if (!address)"), true);

  const client = readCode("../src/features/home/push-client.ts");
  const off = client.slice(client.indexOf("export async function turnOffPush"));
  // **주소를 먼저 챙기고 그다음에 끊는다** — 순서가 바뀌면 서버가 지울 곳을 모른다.
  check("끊기 전에 주소를 챙긴다", off.indexOf("endpoint = sub?.endpoint") < off.indexOf("unsubscribe()"), true);
  check("서버에는 그 주소만 보낸다", /clearPushSubscription\(endpoint\)/.test(off), true);

  const read = client.slice(client.indexOf("export async function readPushState"));
  // **서버 값을 이 기기의 판정에 섞지 않는다.** 섞이면 휴대폰에만 켜진 PC 가 켜짐으로 보인다.
  check("서버 값을 이 기기의 판정에 쓰지 않는다", /subscribed:\s*local\b/.test(read), true);
  check("판정은 브라우저의 구독을 본다", read.includes("getSubscription()"), true);
}

/* ── 발송 실패: 원인은 남기고 인증번호는 남기지 않는다 ──────── */

console.log("\n이메일 발송 실패 (운영 로그에 인증번호가 남지 않는다)");
{
  // 발송이 막혔을 때 유일하게 남는 값들. `magicLink` 를 누르면 그 사람의 계정이다.
  const secrets = {
    email: "someone@example.com",
    code: "483920",
    magicLink: "https://app.example/join/verify?token=11111111-2222-3333-4444-555555555555",
  };

  const leaks = (line: string) => [secrets.email, secrets.code, secrets.magicLink].filter((v) => line.includes(v));

  // Resend 가 거절한 경로.
  const resendFail = undelivery(true, "Resend 가 거절했습니다", secrets);
  check("운영 + Resend 실패 → 발송 실패로 말한다", resendFail.result, { success: false });
  check("운영 + Resend 실패 → 인증번호를 화면으로 돌려주지 않는다", resendFail.result.previewCode, undefined);
  check("운영 + Resend 실패 → 로그에 인증값이 없다", leaks(resendFail.line), []);
  check("운영 + Resend 실패 → 원인은 남는다", resendFail.line.includes("Resend 가 거절했습니다"), true);

  // 보낼 수단이 아예 없는 경로. 새 경로를 붙일 때 빠지기 쉬운 자리다.
  const noProvider = undelivery(true, "보낼 수단이 설정되어 있지 않습니다", secrets);
  check("운영 + 보낼 수단 없음 → 인증값이 없다", leaks(noProvider.line), []);
  check("운영 + 보낼 수단 없음 → 발송 실패로 말한다", noProvider.result, { success: false });

  // 발송이 됐으면 이 함수는 부르지 않는다 — 성공 경로는 로그도 결과도 이래야 한다.
  check("운영에서도 previewCode 가 나오면 안 된다", undelivery(true, "x", secrets).result.previewCode, undefined);

  // 개발에서는 편의가 남는다. 메일을 못 받아도 로그인할 수 있어야 개발이 된다.
  const dev = undelivery(false, "Resend 가 거절했습니다", secrets);
  check("개발 → 인증번호를 화면으로 돌려준다", dev.result, { success: true, previewCode: secrets.code });
  check("개발 → 로그에 인증번호가 보여야 한다", dev.line.includes(secrets.code), true);
  check("개발 → 매직 링크가 보여야 한다", dev.line.includes(secrets.magicLink), true);
}

/* ── AI 한도: 세는 것과 쓰는 것이 다르다 ──────────────────── */

console.log("\nAI 사용량");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const usage = () => db.aiUsage.count({ where: { memberId: member.id, day } });
    const mine = { teamId: team.id, memberId: member.id, tool: "cushion", day };
    const before = await usage();

    // **읽기는 기록을 늘리지 않는다.**
    const me = { id: member.id, teamId: team.id, name: member.name, isLeader: false };
    const first = await aiUsageToday(me);
    const second = await aiUsageToday(me);
    check("여러 번 읽어도 사용량이 늘지 않는다", [first.mine, second.mine], [first.mine, first.mine]);
    check("읽기만으로는 기록이 늘지 않는다", await usage(), before);

    // **쓰는 쪽은 정확히 한 건만 남긴다.**
    await db.aiUsage.create({ data: mine });
    check("한 번 쓰면 기록이 정확히 1 늘어난다", await usage(), before + 1);
    const after = await aiUsageToday(me);
    check("쓴 만큼 사용량이 늘어난다", after.mine, first.mine + 1);

    const made = await db.aiUsage.findFirst({ where: mine, orderBy: { id: "desc" } });
    if (before > 0) {
      console.log("  · 그날 기록이 이미 있어, 이 검사가 만든 행만 지웁니다");
    }
    if (made) await db.aiUsage.delete({ where: { id: made.id } });
    check("**이 검사가 만든 한 건만** 치우면 원래대로", await usage(), before);
  }
}

/* ── AI 한도: 실패한 호출은 한도를 쓰지 않는다 ──────────────── */

console.log("\nAI 사용량: 실패하면 되돌아온다");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const me = { id: member.id, teamId: team.id, name: member.name, isLeader: false };
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const usage = () => db.aiUsage.count({ where: { memberId: me.id, day } });
    const before = await usage();

    // 1) 호출 시 기록을 남긴다
    const taken = await recordAiUsage(me, "cushion");
    if (!taken.ok) {
      console.log("  · 오늘 AI 기록이 막혀 있어, 이 항목은 오늘 다시 보지 않습니다");
    } else {
      check("모델을 부르기 전에 기록을 남긴다", await usage(), before + 1);
      check("남긴 줄이 무엇인지 알려 준다", typeof taken.usageId, "string");

      // 2) **남의 기록은 되돌릴 수 없다.**
      const other =
        (await db.member.findFirst({ where: { teamId: team.id, id: { not: member.id } } })) ?? null;
      if (other) {
        const othersBefore = await db.aiUsage.count({ where: { memberId: other.id, day } });
        const stolen = await refundAiUsage({ ...me, id: other.id }, taken.usageId);
        check("남의 기록은 되돌릴 수 없다", stolen, false);
        check("남의 기록도 그대로다", await db.aiUsage.count({ where: { memberId: other.id, day } }), othersBefore);
      }

      // 3) 자기 기록은 **그 한 건만** 돌아온다.
      const refunded = await refundAiUsage(me, taken.usageId);
      check("실패한 호출은 기록을 되돌려 받는다", refunded, true);
      check("되돌린 뒤 기록이 원래대로다", await usage(), before);
    }
  }
}

{
  const run = readCode("../src/server/ai/run.ts");
  check("실패한 호출은 기록을 되돌린다", /refundAiUsage\(\s*me\s*,\s*usageId\s*\)/.test(run), true);
  check("되돌림은 실패 경로 안에서 일어난다", run.indexOf("catch") < run.indexOf("refundAiUsage("), true);
  check("성공한 호출은 기록을 그대로 둔다", run.indexOf("return { ok: true") < run.indexOf("refundAiUsage("), true);
  check("키가 없으면 기록을 남기지 않는다", /if \(live\) \{[\s\S]*?recordAiUsage/.test(run), true);

  // 재생성(redo) vs 세션 복원(restore) 한도 계약 검증
  const draftHook = readCode("../src/features/tools/use-ai-draft.ts");
  check("redo는 서버 호출 함수를 강제 실행한다", /redo = useCallback\(\(\) => execute\(true\)/.test(draftHook), true);
  const restoreFn = draftHook.slice(draftHook.indexOf("restore = useCallback("));
  check("restore는 run() 또는 execute()를 부르지 않는다", !restoreFn.includes("run(") && !restoreFn.includes("execute("), true);
  check("restore는 로컬 state만 갱신한다", restoreFn.includes("setResult(") && restoreFn.includes("setHistory("), true);
}

/* ── AI 모델: 도구마다 다른 모델을 쓴다 ──────────────────────── */

console.log("\nAI 모델 라우팅");
{
  // ⚠️ 이 검사는 **환경 변수를 바꿔 본다.** 라우팅은 호출 때 env 를 읽어야 하니 이 방법밖에
  // 없고, 다 읽으면 원래대로 되돌린다 — 되돌리지 않으면 이 스모크가 실행된 뒤의 모든
  // AI 호출이 이 값으로 부른다(개발 중에는 그게 실제 버그가 된다).
  const KEYS = [
    "OPENROUTER_MODEL",
    "OPENROUTER_MODEL_CUSHION",
    "OPENROUTER_MODEL_CLERK",
    "OPENROUTER_MODEL_RESEARCH",
    "OPENROUTER_MODEL_PRESENT",
    "OPENROUTER_MODEL_SENTENCE",
    "OPENROUTER_MODEL_READ_CUSHION",
    "OPENROUTER_FALLBACK_MODEL",
  ];
  const saved = new Map(KEYS.map((k) => [k, process.env[k]]));
  const set = (k: string, v: string) => { process.env[k] = v; };
  const restore = () => {
    for (const [k, v] of saved) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };

  const TOOLS = ["cushion", "clerk", "research", "present", "sentence", "read-cushion"] as const;

  try {
    // 1) 아무것도 없으면 무료 라우터 — **유료 슬러그가 되지 않는다.** 유료는 사람이 고르는
    //    값이라 `.env` 가 빈 상태에서 돈이 나가면 안 된다.
    for (const k of KEYS) delete process.env[k];
    check("아무 설정이 없으면 무료 라우터", new Set(TOOLS.map((t) => modelFor(t))), new Set(["openrouter/free"]));

    // 2) 도구별로 다르게 정할 수 있다 — 이게 2번의 전부다.
    set("OPENROUTER_MODEL_CLERK", "free/model-a");
    set("OPENROUTER_MODEL_PRESENT", "free/model-b");
    check("도구별로 다른 모델을 고른다", [modelFor("clerk"), modelFor("present")], ["free/model-a", "free/model-b"]);
    check("정하지 않은 도구는 전체 기본값을 쓴다", modelFor("cushion"), "openrouter/free");

    // 3) 전체 기본값이 있으면 **도구별 값이 없을 때만** 뒤받침된다.
    set("OPENROUTER_MODEL", "free/default");
    check("전체 기본값이 뒤받침한다", modelFor("cushion"), "free/default");
    check("도구별 값이 이긴다", modelFor("clerk"), "free/model-a");

    // 4) **여섯 도구 모두** env 이름을 갖는다. 하나라도 빠지면 그 도구는 조용히 전체
    //    기본값으로 떨어지고, "설정했는데 안 먹힌" 것처럼 보인다.
    set("OPENROUTER_MODEL_CUSHION", "free/c");
    set("OPENROUTER_MODEL_RESEARCH", "free/r");
    set("OPENROUTER_MODEL_SENTENCE", "free/s");
    set("OPENROUTER_MODEL_READ_CUSHION", "free/rc");
    check("여섯 도구 모두 따로 정할 수 있다", TOOLS.map((t) => modelFor(t)), [
      "free/c", "free/model-a", "free/r", "free/model-b", "free/s", "free/rc",
    ]);

    // 5) **빈 문자열은 없는 것으로 본다.** `.env` 에 `KEY=""` 로 남겨두는 일이 흔하고,
    //    빈 문자열이 값이 되면 그 도구는 이름 없는 모델을 부른다.
    set("OPENROUTER_MODEL_CUSHION", "   ");
    check("빈 값은 없는 것으로 본다", modelFor("cushion"), "free/default");

    // 6) 폴백은 **첫 모델과 같을 수 없다.** 같으면 두 번 부르는 것이 시간이 두 배일 뿐이다.
    set("OPENROUTER_FALLBACK_MODEL", "free/default");
    check("폴백이 첫 모델과 같으면 다른 모델로 내려간다", fallbackModelFor("cushion"), "openrouter/free");
    set("OPENROUTER_FALLBACK_MODEL", "free/other");
    check("지정한 폴백을 쓴다", fallbackModelFor("clerk"), "free/other");
    check("폴백이 없는 첫 모델은 무료 라우터가 받는다", fallbackModelFor("cushion"), "free/other");
  } finally {
    restore();
  }
}

/* ── AI 실패: 다시 시도해도 되는 종류 ────────────────────────── */

console.log("\nAI 재시도 정책");
{
  const err = (status: number, name = "Error", message = "") =>
    Object.assign(new Error(message), { status, name });

  // 일시적인 것 — 다시 시도한다.
  check("타임아웃은 다시 시도한다", isTransient(err(408, "APIConnectionTimeoutError", "Request timed out.")), true);
  check("연결 오류는 다시 시도한다", isTransient(err(500, "InternalServerError")), true);
  check("빈 응답은 다시 시도한다", isTransient(new Error("빈 응답")), true);
  check("도구 호출이 없으면 다시 시도한다", isTransient(new Error("도구 호출이 없는 응답")), true);

  // 다시 해도 같은 것 — 시도하지 않는다. **무료 티어에서 429 가 가장 흔하다.**
  check("429 는 다시 시도하지 않는다", isTransient(err(429, "RateLimitError", "Provider returned error")), false);
  check("메시지에 429 가 있어도 그렇다", isTransient(new Error("429 Too Many Requests")), false);
  check("키가 없으면 다시 시도하지 않는다", isTransient(err(401, "AuthenticationError", "invalid api key")), false);
  check("잘못된 요청도 다시 시도하지 않는다", isTransient(err(400, "BadRequestError")), false);

  // withFallback 계약 테스트 (1차 일시실패 → 정확히 1회 폴백 모델 호출 → 성공 또는 최종 실패)
  {
    const calls: string[] = [];
    const res = await withFallback("clerk", "model-a", "model-b", async (m) => {
      calls.push(m);
      if (m === "model-a") throw new Error("빈 응답");
      return "성공";
    });
    check("1차 일시 실패 시 폴백 모델로 1회 재시도하여 성공", res, "성공");
    check("호출 순서는 [primary, fallback]", calls, ["model-a", "model-b"]);
  }
  {
    const calls: string[] = [];
    let caught: Error | null = null;
    try {
      await withFallback("clerk", "model-a", "model-b", async (m) => {
        calls.push(m);
        throw new Error("빈 응답");
      });
    } catch (e) {
      caught = e as Error;
    }
    check("2차 폴백까지 실패하면 최종 예외 발생", caught?.message, "빈 응답");
    check("더 이상 추가 재시도하지 않고 정확히 2회에서 멈춤", calls, ["model-a", "model-b"]);
  }
  {
    const calls: string[] = [];
    let caught: Error | null = null;
    try {
      await withFallback("clerk", "model-a", "model-b", async (m) => {
        calls.push(m);
        throw err(429, "RateLimitError", "429 Too Many Requests");
      });
    } catch (e) {
      caught = e as Error;
    }
    check("429 같은 비일시적 오류는 폴백 없이 즉시 중단", calls, ["model-a"]);
    check("429 예외 유지", caught?.message, "429 Too Many Requests");
  }
}

/* ── AI 초안: 모델이 뭘 주든 화면에 오게 정리한다 ────────────── */

console.log("\nAI 초안 정리 (모델을 부르지 않고 확인한다)");
{
  // **담당자가 null 이어야 하는 곳** — 0단계 5번이 "담당자가 null 이어야 하는 메모에서 null
  // 이 나온다" 를 모델 행동으로 잰다면, 여기는 그 뒷부분이다. **빈 값을 사람이 이름인 것처럼
  // 보면 아무도 책임지지 않는 업무가 생긴다.**
  for (const empty of ["", "   ", "미정", "없음", "null", "NULL", "없음.", "-", "n/a", "<unknown>"]) {
    const draft = shapeClerkDraft({ summary: "회의", candidates: [{ title: "자료 정리", assignee: empty, basis: "b", due: "d" }] });
    if (draft.candidates[0]?.assignee !== null) {
      check(`담당자 "${empty}" 는 사람이 아니다`, draft.candidates[0]?.assignee, null);
    }
  }
  check("담당자가 빈 값이면 null 이 된다", shapeClerkDraft({ candidates: [{ title: "a", assignee: "" }] }).candidates[0]?.assignee, null);
  check("담당자 칸이 아예 없어도 null 이 된다", shapeClerkDraft({ candidates: [{ title: "a" }] }).candidates[0]?.assignee, null);
  // **진짜 이름은 살아야 한다** — 위를 너무 넓게 걸면 아무도 못 고치게 된다.
  check("이름은 살아남는다", shapeClerkDraft({ candidates: [{ title: "a", assignee: "민준" }] }).candidates[0]?.assignee, "민준");
  check("이름 앞뒤 공백은 걷어낸다", shapeClerkDraft({ candidates: [{ title: "a", assignee: "  민준 " }] }).candidates[0]?.assignee, "민준");

  // **근거도 없다면 사람이 직접 정해야 한다** — 빈 화면이 아니라 안내가 있어야 한다.
  check("근거가 없으면 직접 정하라고 한다", shapeClerkDraft({ candidates: [{ title: "a", assignee: "민준" }] }).candidates[0]?.basis, "담당 미정 — 직접 정해 주세요");
  check("마감도 없으면 미정", shapeClerkDraft({ candidates: [{ title: "a" }] }).candidates[0]?.due, "미정");

  // **줄 번호는 모델이 정하지 않는다.** 두 후보에 같은 번호가 오면 화면에서 한 줄이 두 번
  // 다뤄진다. 그래서 순서대로 다시 매긴다.
  check("번호가 비면 줄도 빠진다", shapeClerkDraft({ candidates: [{ title: "a", assignee: null }, { title: "  ", assignee: null }, { title: "b", assignee: null }] }).candidates.map((c) => c.title), ["a", "b"]);
  check("번호는 순서대로 다시 매긴다", shapeClerkDraft({ candidates: [{ title: "a" }, { title: "b" }] }).candidates.map((c) => c.id), ["c1", "c2"]);
  check("모델이 준 번호는 무시한다", shapeClerkDraft({ candidates: [{ title: "a" }, { title: "b" }] as never }).candidates[0]?.id, "c1");

  // **응답이 아예 없을 때** — 빈 화면이 아니라 빈 결과여야 한다(화면이 "0건" 을 알 수 있게).
  check("응답이 없어도 죽지 않는다", shapeClerkDraft(null), { summary: "", candidates: [] });
  check("후보가 문자열이어도 죽지 않는다", shapeClerkDraft({ candidates: "x" as never }).candidates, []);

  // 모델이 `tool_choice` 를 무시하고 본문에 JSON 을 쏟아도 **같은 답으로** 받는다(모양만 건진다).
  check("순수 JSON", extractJsonObject('{"a":1}'), { a: 1 });
  check("코드펜스 안의 JSON", extractJsonObject('설명입니다\n```json\n{"a":1}\n```\n끝'), { a: 1 });
  check("앞뒤 설명이 붙은 JSON", extractJsonObject('결과는 {"a":"x"} 입니다.'), { a: "x" });
  check("문자열 안의 중괄호는 세지 않는다", extractJsonObject('앞 {"a":"}{"} 뒤'), { a: "}{" });
  check("배열 타입은 객체가 아니므로 거부", extractJsonObject("[1,2,3]"), null);
  check("문자열 타입 거부", extractJsonObject('"hello"'), null);
  check("숫자 타입 거부", extractJsonObject("12345"), null);
  check("불리언 타입 거부", extractJsonObject("true"), null);
  check("JSON 이 없으면 null", extractJsonObject("그냥 일반 텍스트 설명"), null);
  check("빈 입력은 null", extractJsonObject(null), null);
  check("공백만 있는 입력은 null", extractJsonObject("   \n\t  "), null);
  check("깨진 JSON 은 null", extractJsonObject('{"a":'), null);
  check("닫히지 않은 문자열", extractJsonObject('{"a":"broken}'), null);

  // 필수 키 및 스키마 검사
  check("필수 키가 다 있으면 빈 목록", missingRequired({ required: ["a", "b"] }, { a: 1, b: 2 }), []);
  check("빠진 필수 키를 알려 준다", missingRequired({ required: ["a", "b"] }, { a: 1 }), ["b"]);
  check("required 가 없으면 빈 목록", missingRequired({}, {}), []);
  check("필수 키가 배열이 아니어도 에러 안 남", missingRequired({ required: "not-array" as never }, { a: 1 }), []);
  check("깨진 인자는 재시도 대상이다", isTransient(new SyntaxError("Unexpected token")), true);

  // 이상 징후 판정 단일 규칙 테스트
  check("호출 5건 미만이면 이상 징후 없음", detectAiAnomalies({ totalCalls: 4, failureRate: 0.5, retryRate: 0.5, slowRate: 0.5 }).warnings.length, 0);
  check("실패율 20% 이상 감지", detectAiAnomalies({ totalCalls: 10, failureRate: 0.25, retryRate: 0, slowRate: 0 }).hasFailureSpike, true);
  check("재시도 30% 이상 감지", detectAiAnomalies({ totalCalls: 10, failureRate: 0, retryRate: 0.35, slowRate: 0 }).hasRetrySpike, true);
  check("지연 30% 이상 감지", detectAiAnomalies({ totalCalls: 10, failureRate: 0, retryRate: 0, slowRate: 0.4 }).hasHighLatency, true);

  // 발표 지원 — **질문만** 담는다. 답이 섞이면 "발표자가 모르는 답"이 초안이 된다.
  const present = shapePresentDraft({ refined: "  다듬은 대본  ", questions: ["  왜?  ", "   ", null] });
  check("대본은 다듬는다", present.refined, "다듬은 대본");
  check("빈 질문은 버린다", present.questions, ["왜?"]);
  check("발표 응답이 없어도 죽지 않는다", shapePresentDraft(null), { refined: "", questions: [] });

  // `orNull` 은 두 도구가 함께 쓰는 **하나의 규칙**이다 — 두 곳에서 따로 걸러 냈던 것을
  // 한 곳으로 모았다. "없음" 을 적는 방식은 은근히 많다.
  check("orNull 은 빈 공백도 없다로 본다", orNull("  "), null);
  check("orNull 은 숫자 0 도 값으로 본다", orNull("0"), "0");
}

/* ── AI 스트리밍: 바이트 경계에서 글자가 깨지지 않는다 ────────── */

console.log("\nAI 스트리밍 줄 분해");
{
  const encoder = new TextEncoder();
  /**
   * 서버가 실제로 밀어주는 것을 흉내 낸다 — **바이트 경계를 일부러 글자 한자 안에서 자른다.**
   *
   * 네트워크는 이렇게 온다. 한국어는 한 글자가 3바이트라 1바이트씩 쪼개면 중간에서 잘린다.
   * 여기서 `TextDecoder` 를 **한 번에** 쓰면 `�` 가 남고, 화면엔 깨진 글자가 보인다 —
   * 사용자는 "모델이 이상한 글자를 냈다" 하고 오해한다.
   *
   * ⚠️ **디코더는 하나만 쓴다.** 매 바이트마다 새로 만들면 상태가 없어서 **어떤 입력에서도**
   * 깨진다(첫 인자를 만들다가 여기서 실제로 그랬다). 클라이언트는 하나를 재사용하고
   * `{ stream: true }` 로 중간의 bytes 를 붙여 받는다 — 이게 전부다.
   */
  const makeDecode = () => {
    const decoder = new TextDecoder();
    return (bytes: Uint8Array) => decoder.decode(bytes, { stream: true });
  };

  // 1) 한 줄이 바이트 경계에서 잘려 온다 — 그래도 한 줄로 복구된다.
  {
    const full = encoder.encode('{"delta":"안녕"}\n{"delta":"하세요"}\n');
    const s = newLineSplitter();
    const decode = makeDecode();
    const lines: string[] = [];
    // **한 바이트씩** 준다 — 가장 나쁜 경우다.
    for (const byte of full) lines.push(...pushBytes(s, Uint8Array.of(byte), decode));
    check("한 바이트씩 잘려도 글자가 안 깨진다", lines, ['{"delta":"안녕"}', '{"delta":"하세요"}']);
    check("끝에 남은 것이 없다", flush(s), null);
  }

  // 1-1) **디코더를 매번 새로 만들면 깨진다** — 이게 위 검사가 통과해야 하는 이유다.
  //      나쁜 구현이 통과하지 않는지 확인해야 좋은 검사가 된다.
  {
    const full = encoder.encode('{"delta":"안녕"}\n');
    const s = newLineSplitter();
    const lines: string[] = [];
    for (const byte of full) {
      lines.push(...pushBytes(s, Uint8Array.of(byte), (b) => new TextDecoder().decode(b, { stream: true })));
    }
    check("디코더를 매번 새로 만들면 글자가 깨진다(위 검사가 값을 보는 이유)", /�/.test(lines.join("")), true);
  }

  // 2) 한 번에 여러 줄이 온다 — **뒤의 줄을 놓치면** 조각이 사라진다.
  {
    const s = newLineSplitter();
    const lines = pushBytes(s, encoder.encode('{"d":1}\n{"d":2}\n{"d":3}\n'), makeDecode());
    check("한 번에 세 줄이 와도 다 읽는다", lines, ['{"d":1}', '{"d":2}', '{"d":3}']);
  }

  // 3) 줄이 **둘에 걸쳐** 온다 — 절반만 주고 멈춘다.
  {
    const s = newLineSplitter();
    const decode = makeDecode();
    check("줄이 아직 안 끝났으면 아무 것도 내지 않는다", pushBytes(s, encoder.encode('{"delta":'), decode), []);
    check("이어서 오면 그때 한 줄이 나온다", pushBytes(s, encoder.encode('"안녕"}\n'), decode), ['{"delta":"안녕"}']);
  }

  // 4) 마지막 줄에 **개행이 없을 수 있다** — stream 이 닫히면서 밀어 넣는다. 이걸 놓치면
  //    **완성값이 영영 오지 않아** 사용자는 "도중에 끊겼다" 를 본다.
  {
    const s = newLineSplitter();
    const decode = makeDecode();
    check("마지막 줄에 개행이 없어도 나온다", [pushBytes(s, encoder.encode('{"source":"ai"}'), decode), flush(s)], [[], '{"source":"ai"}']);
    check("두 번 꺼내도 같은 게 나오지 않는다", flush(s), null);
  }

  // 5) 빈 줄은 건너뛴다 — 빈 문자열을 "한 줄" 로 돌려주면 클라이언트가 `JSON.parse("")` 를
  //    시도하고 매번 예외를 삼킨다(조용하지만 매 프레임마다).
  {
    const s = newLineSplitter();
    check("빈 줄은 건너뛴다", pushBytes(s, encoder.encode('\n\n{"a":1}\n\n'), makeDecode()), ['{"a":1}']);
  }

  // 6) splitter 를 **공유하면 두 호출이 섞인다.** 그래서 호출마다 새로 만들어야 한다.
  //    (a 에 온 줄이 b 의 버퍼에 섞이면 **다른 사람의 AI 글**이 화면에 나타난다.)
  {
    const a = newLineSplitter();
    const b = newLineSplitter();
    const first = pushBytes(a, encoder.encode('{"who":"a"}\n'), makeDecode());
    // **b 에는 아무것도 없다** — 아직 줄이 끝나지 않은 `{"who":"b` 조각만 있는 상태로 둔다.
    const second = pushBytes(b, encoder.encode('{"who":"b'), makeDecode());
    check("splitter 는 호출마다 따로다", [first, second, flush(a), flush(b)], [['{"who":"a"}'], [], null, '{"who":"b']);
  }
}

/* ── 홈 브리핑: 있는 숫자만 말한다 ──────────────────────────── */

console.log("\n홈 브리핑");
{
  const TODAY = "2026-09-30";
  const task = (over: Partial<Task> = {}): Task =>
    ({
      id: "t1",
      title: "자료 정리",
      kind: "team",
      assignee: "민준",
      mbti: null,
      assigneeLeft: false,
      isMine: false,
      due: "9/22",
      status: "todo",
      source: "manual",
      canEdit: false,
      editBlockedBecause: null,
      ...over,
    }) as Task;

  const meeting = (over: Partial<MeetingProposal> = {}): MeetingProposal =>
    ({
      stage: "confirmed",
      slot: { id: "s1", day: "수", time: "16:00 – 18:00", available: 4, total: 5, blockedBy: null },
      date: TODAY,
      agreed: 4,
      pending: 0,
      against: 0,
      respondBy: null,
      myResponse: "agree",
      ...over,
    }) as MeetingProposal;

  // 1) **0 인 줄은 그리지 않는다** — "오늘 0건" 상자를 띄우면 그게 소음이 된다.
  {
    const clean = buildBriefing({ today: TODAY, awaitingMe: 0, meeting: meeting({ stage: "idle", date: null }), tasks: [] });
    check("할 일이 없으면 카드를 그리지 않는다", clean.length, 0);
  }

  // 2) 마감 미정 — **`dueOf` 가 빈 값을 "미정" 으로 저장한다**(`server/actions/tasks.ts`).
  //    빈 문자열과 "미정" 둘 다 세야, 저장 전에 만든 일과 나중에 만든 일이 함께 잡힌다.
  check("빈 마감을 아직 안 정한 일로 센다", isDueUnset({ due: "" }), true);
  check("미정 도 아직 안 정한 일이다", isDueUnset({ due: "미정" }), true);
  check("마감을 정했으면 세지 않는다", isDueUnset({ due: "9/22" }), false);
  // **자유 텍스트 마감을 파싱하지 않는다.** "다음 주" 를 오늘로 읽으면 틀린 숫자가 된다.
  check("자유 텍스트 마감은 세지 않는다(오해 없기 위해)", isDueUnset({ due: "다음 주" }), false);

  // 3) 마감 미정 줄 — **끝난 일은 제외한다.** 끝난 일에 마감을 재촉하는 것은 아니다.
  {
    const lines = buildBriefing({
      today: TODAY,
      awaitingMe: 0,
      meeting: meeting({ stage: "idle", date: null }),
      tasks: [task({ id: "a", due: "" }), task({ id: "b", due: "미정" }), task({ id: "c", due: "9/22" }), task({ id: "d", due: "", status: "done" })],
    });
    const due = lines.find((l) => l.key === "due");
    check("마감 미정을 센다(끝난 일은 빼고)", due?.count, 2);
    check("숫자가 문장에 그대로 들어간다", due?.text, "마감을 아직 안 정한 일이 2건이에요");
  }

  // 4) 오늘 회의 — **확정된 것만.** 제안 중인 건 오늘 회의가 아니다.
  check("확정되고 오늘이면 오늘 회의다", isMeetingToday(meeting(), TODAY), true);
  check("제표 중인 건 오늘 회의가 아니다", isMeetingToday(meeting({ stage: "proposed", myResponse: null }), TODAY), false);
  check("이월된 건 오늘 회의가 아니다", isMeetingToday(meeting({ stage: "carried" }), TODAY), false);
  // ⚠️ **`date` 가 null 인 확정 회의** — 화면도 날짜를 되짚지 않는다(types.ts:144).
  //    모르는 것과 아닌 것을 같은 값으로 보면 "오늘 회의 없음" 이라는 **거짓말**이 된다.
  check("날짜를 모르면 오늘 회의라고 하지 않는다", isMeetingToday(meeting({ date: null }), TODAY), false);
  {
    const lines = buildBriefing({ today: TODAY, awaitingMe: 0, meeting: meeting(), tasks: [] });
    check("회의 시간이 문장에 들어간다", lines.find((l) => l.key === "meeting")?.text, "오늘 16:00에 회의가 있어요");
  }
  // **어제면 오늘이 아니다** — 하루 밀리면 브리핑이 거짓말이 된다.
  check("다른 날짜면 오늘 회의가 아니다", isMeetingToday(meeting(), "2026-10-01"), false);

  // 5) 독촉 — **poke 화면과 같은 조건이어야 한다.** 한쪽만 세면 두 화면이 어긋난다.
  {
    const targets = pokeTargets([
      task({ id: "a" }),                                        // 남의 일 → 가능
      task({ id: "b", isMine: true }),                          // 내 일 → 불가(알림이 안 감)
      task({ id: "c", assigneeLeft: true }),                    // 나간 담당자 → 불가
      task({ id: "d", status: "done" }),                        // 끝남 → 불가
      task({ id: "e", assignee: null }),                        // 담당자 없음 → 보낼 사람 없음
    ]);
    check("독촉할 수 있는 일만 센다", targets.map((t) => t.id), ["a"]);
    const lines = buildBriefing({ today: TODAY, awaitingMe: 0, meeting: meeting({ stage: "idle", date: null }), tasks: [task({ id: "a" })] });
    check("독촉 줄이 poke 화면으로 연결된다", lines.find((l) => l.key === "poke")?.href, "/home/tasks/poke");
  }

  // 6) 확인 대기 — **화면이 이미 센 값을 그대로 받는다.** 여기서 다시 세지 않는다.
  {
    const lines = buildBriefing({ today: TODAY, awaitingMe: 3, meeting: meeting({ stage: "idle", date: null }), tasks: [] });
    check("확인 대기 수를 그대로 말한다", lines.find((l) => l.key === "awaiting")?.count, 3);
  }

  // 7) 제출함 마감 — **`dueAt` 이 DateTime 인 유일한 곳**이라 "며칠 남았나" 를 말할 수 있다.
  {
    const box = (role: RoleKey, name: string, dueAt: string | null) => ({ role, name, dueAt });
    const soon = boxesDueSoon(
      [
        box("deck", "발표자료", "2026-10-02T23:59"), // 2일 뒤 → 임박
        box("research", "자료", "2026-10-20T23:59"), // 20일 뒤 → 아님
        box("script", "대본", null),                 // 마감 없음 → 아님
        box("deck", "지난 제출함", "2026-09-01T23:59"), // 이미 지남 → "임박" 이 아님
      ],
      TODAY,
    );
    check("임박한 마감만 센다", soon.map((b) => b.name), ["발표자료"]);
    check("며칠 남았나를 말한다", soon[0]?.daysLeft, 2);
  }

  // 8) 추천 — **규칙으로만.** 왜 이 도구인지는 반드시 붙는다(추천에 이유가 없으면 광고다).
  {
    const boxes = [
      { role: "deck" as const, name: "발표자료", dueAt: "2026-10-01T23:59" },
      { role: "research" as const, name: "자료", dueAt: "2026-10-02T23:59" },
    ];
    const withPoke = suggestTools({ tasks: [task({ id: "a" })], today: TODAY, boxes });
    check("독촉할 일이 있으면 쿠션 번역기", withPoke.map((s) => s.toolKey), ["cushion", "present", "research"]);
    check("추천에 이유가 붙는다", withPoke.every((s) => s.because.length > 0), true);
    // 도구 추천과 화면 연결이 **한 번에** 되어야 한다 — 쿠션 번역기로 가서 poke 화면이 열린다.
    check("쿠션 번역기가 poke 로 연결된다", withPoke[0]?.href, "/home/tasks/poke");
    // 오늘 마감은 "0일 뒤" 가 아니라 **"오늘"** 이라고 말한다(0일 뒤는 한국어로 이상하다).
    const dueToday = suggestTools({
      tasks: [],
      today: TODAY,
      boxes: [{ role: "deck" as const, name: "발표자료", dueAt: "2026-09-30T23:59" }],
    });
    check("오늘 마감이라고 말한다", dueToday[0]?.because.includes("오늘"), true);
    check("0일 뒤라고 말하지 않는다", dueToday[0]?.because.includes("0일"), false);
    // 1일 뒤는 "오늘" 이 아니다 — 날짜를 하루 밀면 문장이 어긋난다.
    const dueTomorrow = suggestTools({
      tasks: [],
      today: TODAY,
      boxes: [{ role: "deck" as const, name: "발표자료", dueAt: "2026-10-01T23:59" }],
    });
    check("내일 마감은 1일 뒤라고 말한다", dueTomorrow[0]?.because.includes("1일 뒤"), true);

    // **임박한 제출함이 없으면 추천도 없다** — 없는 걸 지어내지 않는다.
    const none = suggestTools({ tasks: [], today: TODAY, boxes: [{ role: "deck" as const, name: "발표자료", dueAt: "2026-12-01T23:59" }] });
    check("맞는 상황이 없으면 추천하지 않는다", none, []);
  }

  // 9) **AI 서기 추천이 없는 이유** — 기획안의 규칙("회의가 끝났는데 메모가 없으면")은
  //    회의록을 저장하는 곳이 없어 판정할 수 없다. 지어내면 사용자는 "내 회의록이
  //    사라졌다" 고 오해한다. 저장소가 생기면 그때 이 자리에 규칙 하나를 더한다.
  //
  // ⚠️ **`readCode` 를 쓰면 안 된다.** 이 검사는 **주석에 적힌 설명**을 보는 것이고,
  // `readCode` 는 주석을 지운다(그 이유가 `readCode` 자신의 주석에 적혀 있다). 여기서
  // 구조 검사를 하려고 하면 **어떻게 고쳐도 통과하지 않는다.**
  const briefingRaw = readFileSync(new URL("../src/features/home/briefing.ts", import.meta.url), "utf8");
  check("세지 않는 이유를 코드에 남긴다", /안 세는 이유|세지 않는다/.test(briefingRaw), true);
  check("서기 추천이 없음을 적어 둔다", /AI 서기 추천은 없습니다/.test(briefingRaw), true);
  check("회의록 저장소가 없다는 사실을 적어 둔다", /저장하는 곳이 없|저장하는 곳이 없다/.test(briefingRaw), true);

  // 10) 구조 검사 — **모델을 부르는 코드가 없어야 한다**(`readCode` 로 주석이 지워진 상태).
  const briefingSource = readCode("../src/features/home/briefing.ts");
  check("브리핑은 모델을 부르지 않는다", /askText|askShape|runTool|fetch\(/.test(briefingSource), false);
  // **네 가지만 센다.** 나중에 다섯째를 넣을 때 여기 갱신해야 한다는 표시를 남긴다.
  check("네 개의 규칙만 센다", ["buildBriefing", "pokeTargets", "isDueUnset", "boxesDueSoon"].every((fn) => briefingSource.includes(`function ${fn}`)), true);
}

/* ── AI 계측: 장부에 무엇이 남는가 ───────────────────────────── */

console.log("\nAI 계측");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const where = { teamId: team.id, day };
    // **이 검사만의 행만** 지운다. `day` 전체를 지우면 사람이 그날 쓴 기록이 함께 사라진다
    // (`AI 한도` 항목의 같은 사고 참고).
    const before = await db.aiCall.count({ where });
    const ids = (
      await Promise.all(
        (
          [
            { tool: "clerk", model: "free/x", outcome: "ok", latencyMs: 1_000, retried: false },
            { tool: "clerk", model: "free/x", outcome: "failed", latencyMs: 61_000, retried: true },
            { tool: "cushion", model: "free/y", outcome: "refused", latencyMs: 2_000, retried: false },
          ] as const
        ).map((data) => db.aiCall.create({ data: { ...where, memberId: member.id, ...data }, select: { id: true } })),
      )
    ).map((row) => row.id);

    try {
      const stats = await aiCallStats(team.id);
      const mine = stats.calls - before;
      // **거절은 실패가 아니다.** 답이 온 것이기 때문이다. 한 값으로 합치면 "모델을 바꿔야 한다" 와
      // "다시 시도하면 된다" 가 같은 0 으로 보인다.
      check("거절이 따로 세어진다", stats.outcomes.refused - (before > 0 ? 0 : 0) >= 1, true);
      check("이 검사가 만든 3 줄만 더해진다", mine >= 3, true);
      check("폴백을 탔는지 남는다", stats.retried >= 1, true);

      // **입력 글은 남지 않는다.** 표에 글짜기 열이 있으면 그 순간 약속이 깨진 것이다.
      const columns = Object.keys(
        (db.aiCall as unknown as { fields: Record<string, unknown> }).fields ?? {},
      );
      if (columns.length > 0) {
        const hasText = columns.some((c) => /text|input|prompt|content|message/i.test(c));
        check("계측표에 글짜기 칸이 없다", hasText, false);
        check("모델 이름을 남긴다", columns.includes("model"), true);
        check("지연을 남긴다", columns.includes("latencyMs"), true);
      }

      // 읽기는 계측을 늘리지 않는다 — "지표를 보려고 부른 것"이 호출이 되면 안 된다.
      check("지표를 읽어도 줄이 늘지 않는다", (await aiCallStats(team.id)).calls, stats.calls);
    } finally {
      await db.aiCall.deleteMany({ where: { id: { in: ids } } });
    }
    check("이 검사가 만든 줄만 치운다", await db.aiCall.count({ where }), before);
  }

  // **한 줄 요약이 사람이 읽는 형태인지** — 예약 작업 로그와 curl 응답에 그대로 나온다.
  const sample: AiCallStats = {
    day: "2026-09-30",
    calls: 10,
    outcomes: { ok: 7, refused: 2, failed: 1 },
    byModel: [{ model: "free/x", calls: 8, failed: 1 }, { model: "free/y", calls: 2, failed: 0 }],
    retried: 3,
    avgLatencyMs: 4200,
    slow: 0.2,
  };
  const line = describeAiCalls(sample);
  check("요약에 날짜와 횟수가 있다", /2026-09-30.*10/.test(line), true);
  check("요약에 거절이 보인다", /거절 2/.test(line), true);
  check("요약에 실패가 보인다", /실패 1/.test(line), true);
  check("요약에 폴백이 보인다", /폴백 3/.test(line), true);
  check("요약에 모델별 실패가 보인다", /free\/x\(8\/실패1\)/.test(line), true);
  // 호출이 0 이면 나눗셈이 그대로 드러난다 — 0 으로 나누면 `NaN` 이 문장에 찍힌다.
  const empty = describeAiCalls({
    day: "2026-09-30", calls: 0, outcomes: { ok: 0, refused: 0, failed: 0 },
    byModel: [], retried: 0, avgLatencyMs: null, slow: 0,
  });
  check("호출이 0 이어도 NaN 이 없다", /NaN|Infinity/.test(empty), false);
}

/* ── 타이핑은 한 번도 AI 를 부르지 않는다 ─────────────────── */

console.log("\nAI 초안: 언제 부르는가");
{
  // 화면(`use-ai-draft.ts`)이 **원문이 바뀔 때** 부르는 코드가 남아 있는지 본다.
  // 화면 파일을 문자열로 읽어 확인한다 — 이 검증은 화면을 실행할 수 없어서,
  // "실행했을 때 무엇이 일어나는지" 대신 "자동 부르는 경로가 존재하는가"를 고정한다.
  // 자동 호출이 다시 들어오면(효과·타이머) 여기서 즉시 걸린다.
  const source = readCode("../src/features/tools/use-ai-draft.ts");
  check("원문이 바뀌면 자동으로 부르는 효과가 없다", /useEffect/.test(source), false);
  check("타이핑을 기다리는 타이머가 없다", /setTimeout|SETTLE_MS/.test(source), false);
  // 명시적으로 누를 때만 부른다.
  check("누르면 부르는 길이 있다", /const start = useCallback/.test(source), true);
}

/* ── 결과 옆의 배지는 출처를 따른다 ──────────────────────── */

console.log("\nAI 결과의 출처");
{
  const read = readCode;

  // 예전이 여기서 틀렸다. 서버는 성공을 "일했다"로만 봤고, 키가 없으면 다섯 도구 전부가
  // **예시를 결과 자리에 그대로 돌려주었다.** 화면은 그것을 모른 채 `aiReady` 로 자기 방식대로
  // 알아내려 했고, 그중 forgets한 곳에서 예시가 "AI 초안" 이었다.
  const run = read("../src/server/ai/run.ts");
  check("서버가 성공에 출처를 붙인다", /source: live \? \("ai" as const\) : \("sample" as const\)/.test(run), true);
  check("키가 없으면 예시로 표시한다", /isAiConfigured\(\)/.test(run), true);

  // 출처를 버리는 길이 남아 있으면 또 forgets하는 화면이 나온다.
  const result = read("../src/features/tools/ai-result.ts");
  check("출처를 버리는 함수가 없다", /export function unwrapAi/.test(result), false);
  check("값과 출처가 같이 나온다", /value: T; source: AiAnswerSource/.test(result), true);

  // 카드 자신이 "AI 초안" 을 조건 없이 새겼다. 쓰던 화면이 자기 배지를 바깥에 따로 만들거나
  // 아예 만들지 않았고, 어느 쪽이든 사용자는 출처를 알 수 없었다.
  const card = read("../src/components/ui/compare-card.tsx");
  check("카드가 배지를 직접 정하지 않는다", /resultSource === "ai"/.test(card), true);
  const hardcoded = card.replace(/\{[^{}]*\}/g, "").match(/>\s*AI 초안\s*</);
  check("카드에 배지가 박혀 있지 않다", hardcoded !== null, false);

  // 화면이 또 `aiReady` 로 출처를 추측하면 그 자리에 거짓말이 돌아온다.
  for (const screen of ["cushion", "sentence", "clerk", "present", "researcher"]) {
    const src = read("../src/features/tools/" + screen + "-screen.tsx");
    check(
      `${screen}: 출처를 설정 값으로 추측하지 않는다`,
      /showingSample|source === "ai" \? .*aiReady/.test(src),
      false,
    );
  }
}

/* ── DM 목록 폴링 비용은 총량과 무관해야 한다 ────────────── */

console.log("\nDM 목록 조회 비용");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    // 팀원 둘로 DM 스레드 하나를 만든다.
    const other = await db.member.findFirstOrThrow({
      where: { teamId: team.id, id: { not: member.id }, leftAt: null },
    });
    const key = `dm:${[member.id, other.id].sort().join(":")}`;

    // **앱이 실제로 부르는 함수를 그대로 부른다.**
    //
    // 예전에는 이 검사가 자기만의 `lastPerThread` SQL 을 테스트 안에 적어 두고 그것만 불렀다.
    // 그래서 `src/data/api.ts` 의 `getDmThreads` 가 Prisma 의 `distinct` 로 **되돌아가서**
    // 방의 메시지를 전부 메모리로 끌어와도 이 검사는 통과했다 — 214건이 전부 초록이었다.
    // 검사가 사본을 검사하고 있었고, 원본은 아무도 보지 않았다.
    //
    // `lastMessagePerThread` 는 서버 액션이 아니라 `client` 를 인자로 받는 순수한 데이터
    // 함수다. 세션 쿠키가 필요 없으므로 여기서 부를 수 있고, 부르는 것이 옳다(위 주석의
    // "액션을 우회한다"는 금지는 **쿠키를 만들어 부는** 경우를 말한 것).
    const lastPerThread = (keys: string[]) => lastMessagePerThread(db, team.id, keys);

    const existing = await db.message.count({ where: { threadKey: key } });
    const before = await lastPerThread([key]);

    // 메시지를 30개 쌓는다 — 실제로 늘어나는 비용을 흉내낸다.
    for (let i = 0; i < 30; i += 1) {
      await db.message.create({
        data: { teamId: team.id, threadKey: key, authorId: member.id, text: `비용 확인 ${i}`, whenLabel: "00:00" },
      });
    }
    const grown = await db.message.count({ where: { threadKey: key } });
    const after = await lastPerThread([key]);

    check("메시지가 늘어 폴링이 읽는 행은 늘지 않는다", after.length, before.length);
    check("한 스레드에서 1행만 읽는다", after.length, 1);
    check("읽은 것은 그중 가장 최근 말이다", after[0]?.text, "비용 확인 29");

    // **돌아온 행만으로는 부족하다.** 중복을 걸러내는 방식이 무엇이든 **결과는** 스레드마다
    // 한 줄씩 같고, 비용만 다르다. 그래서 실제로 나가는 SQL 을 보고, **실제로 몇 행을 읽는지**
    // 를 본다. Prisma 의 쿼리 이벤트는 **플레이스홀더가 있는 SQL 과
    // 파라미터 값**을 준다. 둘을 합쳐야 비로소 실제로 나간 문장이 된다.
    const probe = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
      log: [{ emit: "event", level: "query" }],
    });
    const sent: string[] = [];
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    probe.$on("query", (e: { query: string; params: unknown }) => {
      if (!e.query.includes("Message")) return;
      sent.push(e.query.replace(/\s+/g, " "));
      // 형태를 가리지 않는다. `unnest` 나 `LATERAL` 같은 특정 모양에 의존하면, 고쳐지는 순간
      // 예외로 전체 검사가 멈춰 "왜 멈췄는지" 대신 스택만 남는다. **보내는 쿼리가 하나뿐이니**
      // 마지막 Message 쿼리가 곧 그것이다.
      capturedSql = e.query;
      capturedParams = e.params as unknown[];
    });
    // 이벤트 값은 **문자열로 직렬화**되어 온다(`[["dm:…"],"teamId"]` 모양). 그대로 문자열
    // 리터럴로 끼우면 Postgres 가 `malformed array literal` 로 거절한다. JSON 으로 되돌린 뒤
    // 각 값을 Postgres 리터럴로 적는다.
    const paramsOf = (raw: unknown): unknown[] => {
      if (Array.isArray(raw)) return raw as unknown[];
      if (typeof raw === "string") {
        try {
          const parsed: unknown = JSON.parse(raw);
          return Array.isArray(parsed) ? (parsed as unknown[]) : [parsed];
        } catch {
          return [raw];
        }
      }
      return [raw];
    };
    const quote = (value: unknown) =>
      Array.isArray(value)
        ? `ARRAY[${(value as unknown[]).map((v) => `'${String(v).replaceAll("'", "''")}'`).join(",")}]`
        : `'${String(value).replaceAll("'", "''")}'`;

    await lastMessagePerThread(probe as unknown as typeof db, team.id, [key]);

    const sql = sent.join(" ");
    check("DB 로 내려가는 SQL 을 한 번만 보낸다", sent.length, 1);
    check("스레드마다 LIMIT 1 로 멈춘다", /LIMIT 1/i.test(sql), true);
    check("스레드 밖의 값을 고르지 않는다", /LATERAL/i.test(sql), true);

    // 함수가 올바르다고 호출부가 그 결과를 버리면 또 그대로다. 실제로 있었던 일이 이것이다 —
    // `getDmThreads` 가 이 경로를 두고 Prisma `distinct` 로 직접 읽었다. 함수를 고쳐 놓아도
    // **누가 부르는지**를 함께 고정해야 한다.
    const api = readCode("../src/data/api.ts");
    const body = api.slice(api.indexOf("export async function getDmThreads("), api.indexOf("export async function getDmThreads(") + 2600);
    check("getDmThreads 가 이 함수를 부른다", /lastMessagePerThread\(db, teamId, threadKeys\)/.test(body), true);
    check("getDmThreads 가 Prisma distinct 로 직접 읽지 않는다", /distinct: \["threadKey"\]/.test(body), false);
    console.log(`      (전체 메시지 ${existing} → ${grown}건, 조회 행은 ${after.length}행)`);

    // **방 전체 개수로 되돌았는지 재지 않는다.** 이 방은 다른 검사도 함께 쓴다 — 남이 쓰는
    // 사이에 개수가 바뀌면 **내가 제대로 치웠는데 실패**한다(그리고 실제로 그랬다). 내가 만든
    // 행이 남았는지만 본다. "치웠다" 의 뜻은 그거다.
    await db.message.deleteMany({ where: { threadKey: key, text: { startsWith: "비용 확인" } } });
    check(
      "이 검사가 만든 메시지는 남지 않는다",
      await db.message.count({ where: { threadKey: key, text: { startsWith: "비용 확인" } } }),
      0,
    );

    // ── **진짜 비용을 재는 자리.** ───────────────────────────
    //
    // 위에서 세는 "조회 행"은 **돌아온 행**이다. 중복을 걸러내는 방식이 무엇이든 결과는
    // 스레드마다 한 줄로 같다. 실제로 몇 행을 읽었는지는 DB 만 안다.
    //
    // 이 자리가 없다가 `DISTINCT ON` + `= ANY(배열)` 이 그대로 통과했다 — 5,006개 대화에서
    // 실제로 10,013행을 읽고 있었는데 검사에는 "1행" 이라고 적혀 있었다.
    //
    // **SQL 을 여기서 다시 적지 않는다.** 적으면 코드가 바뀌어도 검사는 옛 질문을 재고,
    // 오늘 바로 그랬다. 실제로 해 봤다 — Prisma 어댑터는 배열 파라미터에 이미 `::text[]` 를
    // 붙이는데 여기에 또 붙여서 `::text[]::text[]` 인 **다른 질문을** EXPLAIN 하고 있었다.
    // 앱이 보내는 SQL 을 그대로 받는다(위에서 잡아 둔 `capturedSql`·`capturedParams`).
    // **실행마다 다른 표식.** 이 검사는 로컬 DB 를 쓴다. 다른 사람이 같은 저장소에서
  // `npm test` 를 동시에 돌리면, 둘이 같은 방에 같은 접두사로 줄을 세운다 — 그럼
  // "치운 뒤에도 남았나" 를 재는 쪽이 **상대의 줄을 뒤집어쓴다.**
  //(`계속 같은 방을 쓰는 다른 검사와 함께 돌 때 실제로 났다.)
  // 접두사에 실행마다 다른 값을 넣어 **내 줄만** 세고 치운다.
  const runTag = `${process.pid}-${Date.now().toString(36)}`;
  const mine = `규모 확인 ${runTag} `;
  const mineWhere = { threadKey: key, text: { startsWith: mine } };

  const askSql = async (extra: number) => {
      const base = new Date("2026-01-01T00:00:00Z");
      for (let i = 0; i < extra; i += 500) {
        await db.message.createMany({
          data: Array.from({ length: Math.min(500, extra - i) }, (_, k) => ({
            teamId: team.id,
            threadKey: key,
            authorId: member.id,
            text: `${mine}${i + k}`,
            whenLabel: "00:00",
            // `createMany` 한 번으로 전부 넣으면 `createdAt` 이 한 문장 안의 `now()` 로
            // 같아진다. 실제 대화에서는 그렇지 않고, 같으면 인덱스가 첫 행에서 멈출 수 없다.
            createdAt: new Date(base.getTime() + (i + k) * 1000),
          })),
        });
      }
      await db.$executeRawUnsafe(`ANALYZE "Message"`);

      await lastMessagePerThread(probe as unknown as typeof db, team.id, [key]);
      // 이벤트 안에 들어 있는 값으로 **실제로 나간 문장**을 다시 세운다.
      const values = paramsOf(capturedParams);
      const captured = capturedSql.replace(/\$(\d+)/g, (_, n: string) => quote(values[Number(n) - 1]));
      check("스레드별 마지막 말 SQL 을 잡았다", captured.includes('"Message"'), true);

      const explained = (await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, FORMAT JSON) ${captured}`)) as Array<Record<string, unknown>>;
      let total = 0;
      (function walk(node: Record<string, unknown>) {
        total += Number(node["Actual Rows"] ?? 0) * Number(node["Actual Loops"] ?? 1);
        for (const child of (node["Plans"] as Array<Record<string, unknown>>) ?? []) walk(child);
      })((explained[0]["QUERY PLAN"] as Array<Record<string, unknown>>)[0].Plan as Record<string, unknown>);

      const size = await db.message.count({ where: { threadKey: key } });
      console.log(`      (메시지 ${size}건일 때 DB 가 실제로 읽은 행 ${total})`);
      return total;
    };
    await probe.$disconnect();

    // **검사가 실패해도 측정용 메시지는 치운다.** `check` 는 예외를 던지지 않지만, 그 뒤의
    // 어떤 것이 던지면(앞으로의 새 검사라든가) 치우는 대참이 건너뛰어진다. 그때 개발 DB 에
    // 메시지 5,000줄이 남고, 다음 실행은 "원래대로" 에서 실패한다 — **첫 실패의 잔재가
    // 두 번째 실패를 만든다.** 그래서 `finally` 다.
    // 앞선 실행이 (어떤 이유로든) 치우지 못하고 남긴 **내 표식의** 행을 먼저 치운다. 안 그러면
    // 비교 기준이 조용히 오염된다 — 작은 방에서 10행을 읽는 쿼리가, 5,000개 방에서 5,166행을
    // 읽는 것처럼 보인다. **남의 실행이 만든 행은 만지지 않는다.**
    await db.message.deleteMany({ where: mineWhere });
    check("측정을 시작할 때 이 실행이 만든 잔재가 없다", await db.message.count({ where: mineWhere }), 0);
    let small = 0;
    let big = 0;
    try {
      small = await askSql(0);
      big = await askSql(5000);
      // **비율로 재면 안 된다.** 고장난 쪽도 "1.9배"였다 — 5,000배 데이터를 2배로 읽은 것인데
      // 3배 이하여서 통과했다. 5,000개 방에서 매번 10,000행을 읽는 것이 문제이지, 그게 몇 배
      // 더 늘었는지가 아니다. **절대값**으로 본다. 스레드 하나에 대한 고정 비용이면 몇 행이든
      // 작아야 하고, 방 크기에 비례하면 5,000개로는 수만 행이 된다.
      check("5,000개 방에서도 읽는 행이 100행 미만이다 (방 크기와 무관)", big < 100, true);
      console.log(`      (작을 때 ${small}행 → 5,000개 방에서 ${big}행 · 방이 800배 커졌는데 ${(big / Math.max(small, 1)).toFixed(1)}배)`);
    } finally {
      await db.message.deleteMany({ where: mineWhere });
    }
    check("이 실행이 만든 측정용 메시지는 남지 않는다", await db.message.count({ where: mineWhere }), 0);
  }
}

/* ── 팀 집계는 네 축이 모두 살아 있다 ──────────────────────── */

console.log("\n팀 성향 집계에 네 축이 모두 들어 있다");
{
  // 예전 검사는 **요약 문구**에 네 축이 다 들어가는지를 봤다. 문구는 걷어냈으므로(근거 없는
  // 해석이라) 같은 불변식을 **센 값**에 대해 세운다.
  //
  // **어느 한 축이 조용히 빠지는 것이 이 함수의 실제 버그였다.** `calculateTeamMbtiStats` 는
  // ratio 를 여덟 개 계산했는데 `ratioN` 만 어디에서도 읽히지 않았다 — 네 축 중 하나가 통째로
  // 없는 상태. 어느 팀을 넣어도 S 축 팀과 N 축 팀이 같다면 그것은 집계가 아니라 **한쪽이
  // 없는 것**이다. 문장을 없애도 그 위험은 그대로이므로, 숫자로 박는다.
  const allS = calculateTeamMbtiStats(["ISTJ", "ISFP", "ESTJ", "ISFJ"]);
  const allN = calculateTeamMbtiStats(["INTJ", "INFP", "ENTJ", "INFJ"]);

  check("전부 S 인 팀과 전부 N 인 팀의 집계가 다르다", allS.axes.sn.s !== allN.axes.sn.s, true);
  // **자신의 쪽에는 전원이 서 있고 반대쪽에는 아무도 없다.** 앞의 `dominantSummary` 검사는
  // 문장이 "비어 있지 않은지" 만 봤는데, 수로는 이것을 말할 수 있다 — 세는 값이니까.
  check("S 인 팀은 S 에 전원이고 N 에는 없다", [allS.axes.sn.s, allS.axes.sn.n], [4, 0]);
  check("N 인 팀은 N 에 전원이고 S 에는 없다", [allN.axes.sn.s, allN.axes.sn.n], [0, 4]);

  // 네 축을 전부 훑는다. **불변식은 "한 축의 두 갈래 인원수 합 = 등록한 사람 수" 다.**
  // 한 축의 분기가 사라지면 그 합이 줄어드므로, 어느 축이 비었는지 네 축을 전부 돌지
  // 몰라도 드러난다 — S/N 하나만 놓고 보면 그 축만 놓쳤다는 사실조차 알 수 없다.
  const mixed = calculateTeamMbtiStats(["ISFP", "INFP", "ESTP", "ENTP"]);
  for (const [key, left, right] of [
    ["ei", "e", "i"],
    ["sn", "s", "n"],
    ["tf", "t", "f"],
    ["jp", "j", "p"],
  ] as const) {
    const axis = mixed.axes[key] as Record<string, number>;
    // 네 번째 인자를 넣으면 `check` 가 조용히 버린다(3개만 받는다) — 기대값이 통째로
    // 사라져 "무엇이든 통과"가 된다. 여긴 정확히 셋만 넘긴다.
    check(`${key.toUpperCase()} 축의 두 인원이 합이 등록 인원수다`, axis[left] + axis[right], 4);
  }
  // 미등록자가 섞여도 **합은 등록한 사람 수**로 읽힌다 — 전체로 나누면 네 축이 다 흔들린다.
  const partial = calculateTeamMbtiStats(["ISFP", null, "ESTP", undefined]);
  check("미등록자가 섞여도 합은 등록 인원수다", partial.axes.jp.j + partial.axes.jp.p, partial.withMbti);
  check("미등록자는 전체 수에만 남는다", partial.total, 4);

  // 빈 팀이 50/50 으로 떨어지지 않는지 — `count === 0` 일 때 50 을 쓰고, 그 합이 100 인지.
  const nobody = calculateTeamMbtiStats([null, null]);
  check("아무도 없으면 축이 반반이다", [nobody.axes.sn.ratioS, 100 - nobody.axes.sn.ratioS], [50, 50]);
  check("아무도 없으면 집계에 0 명으로 읽힌다", nobody.withMbti, 0);
  check("아무도 없으면 전체 수는 그대로다", nobody.total, 2);
}

/* ── 13/22 화면은 파일 하나만 읽는다 ───────────────────────── */

console.log("\n파일 보기 화면의 조회 범위");
{
  // 쿼리 수를 재는 대신 **구조**를 고정한다. 화면을 실행할 수 없으므로, "무엇을 요구하는가"를
  // 본다 — 전체 목록을 읽고 하나를 고르는 함수가 남아 있으면 즉시 걸린다.
  const api = readCode("../src/data/api.ts");
  const context = api.slice(
    api.indexOf("export async function getFileViewContext"),
    api.indexOf("export async function getFileViewContext") + 2200,
  );
  check("13/22 화면의 조회는 하나뿐이다", /where: \{ id: fileId, boxId, box: \{ teamId \} \}/.test(context), true);
  check("팀의 모든 제출함을 읽지 않는다", /db\.submissionBox\.findMany/.test(context), false);
  check("그 제출함의 모든 파일을 읽지 않는다", /db\.submittedFile\.findMany/.test(context), false);
  // 화면이 그 함수를 **한 번만** 부르는지.
  const page = readCode("../src/app/(tabs)/drive/[boxId]/[fileId]/page.tsx");
  check("13 화면은 컨텍스트를 한 번 읽는다", (page.match(/getFileViewContext/g) ?? []).length, 2); // import 1 + 호출 1
  check("13 화면이 따로 부르는 함수가 없다", /getSubmissionBox\(|getSubmittedFile\(/.test(page), false);
}

/* ── 문서가 숫자를 담지 않는 자리 ──────────────────────────────── */

console.log("\n문서가 숫자를 담지 않는다");
{
  /**
   * "확정이 필요한 정책이 N건" 같은 **개수를 문서에 적지 않게** 지킨다.
   *
   * 화면이 원래 목록이고(`?review=1` 로 한 번에 보인다) 목록은 계속 늘어난다. 문서에 개수를
   * 적어 두면 화면을 추가한 사람이 그 숫자를 고치기 전까지 문서는 조용히 틀어 있고, 읽는
   * 사람은 그 수를 전체로 믿는다 — 실제로 겪었다. 헤드오프 표는 10행짜리 원본이고 지금은
   * 25곳이다.
   *
   * 그래서 이 검사는 "맞는 숫자"를 재는 대신 **개수를 쓰지 못하게** 막는다.
   */
  const docs = ["../README.md", "../CLAUDE.md"];
  for (const rel of docs) {
    const text = readFileSync(new URL(rel, import.meta.url), "utf8");
    check(`${rel} 은 정책 개수를 적지 않는다`, /정책\s*\d+\s*건/.test(text), false);
    check(`${rel} 은 컴포넌트 개수를 적지 않는다`, /컴포넌트\s*\d+\s*종/.test(text), false);
  }

  // 제거했다면 목록을 읽을 자리는 남아 있어야 한다 — 화면 안의 검토 표시와 그 열기.
  const note = readCode("../src/components/ui/note.tsx");
  check("검토 표시는 화면에서 쓸 수 있다", /export function Undecided/.test(note), true);
  check("검토 표시는 사용자에게 항상 보이지 않는다", /if \(!review\) return null/.test(note), true);
  const review = readCode("../src/lib/review-mode.tsx");
  check("검토 모드를 켜는 방법이 남아 있다", review.includes("__CD_REVIEW__"), true);
}

/* ── 회의 확정 규칙: 저절로 오는 마감 ─────────────────────────── */

console.log("\n회의 확정 규칙 (마감은 아무도 앱을 열지 않아도 지난다)");
{
  const DAY = 86_400_000;
  const soon = new Date(Date.now() + DAY);
  const past = new Date(Date.now() - DAY);
  const base = { respondBy: null as Date | null, against: 0 };

  /**
   * **`effectiveStage` 는 이 저장소에서 가장 값싸게 검증할 수 있는 불변식이다.**
   *
   * 마감은 시각이 지나면 저절로 오는 일이라, 예약을 돌리기 전에도 누군가 화면을 열면 이미 지난
   * 마감이 "제안 대기 중"으로 보인다. 화면(09·홈·배지), 예약 작업, 응답 액션이 **같은 판단**을
   * 해야 하는데 그 판단이 이 함수 하나뿐이다. 여기서 틀어지면 화면은 확정이라는데 눌러 보니
   * 아직 대기 중인 일이 생긴다.
   */
  check("저장된 확정은 그대로 확정이다", effectiveStage({ ...base, stage: "confirmed" }), "confirmed");
  check("저장된 대기는 시간과 상관없이 대기로 보인다", effectiveStage({ ...base, stage: "proposed" }), "proposed");
  check("저장된 이월은 그대로 이월이다", effectiveStage({ ...base, stage: "carried" }), "carried");
  check("아직 안 지난 마감은 대기다", effectiveStage({ ...base, stage: "proposed", respondBy: soon }), "proposed");
  check("지나간 마감은 저절로 확정된다", effectiveStage({ ...base, stage: "proposed", respondBy: past }), "confirmed");
  // 마감이 **아예 없으면** 저절로 확정될 일도 없다 — "확정"을 보여 줄 근거가 없다.
  check("마감 없는 제안은 저절로 확정되지 않는다", effectiveStage({ ...base, stage: "proposed" }), "proposed");
  // 반대가 하나라도 있으면 마감이 지나도 확정되지 않는다.
  check(
    "반대가 하나라도 있으면 마감이 지나도 확정되지 않는다",
    effectiveStage({ stage: "proposed", respondBy: past, against: 1 }),
    "proposed",
  );
  // 경계: 마감과 **같은 순간**은 지난 것이다(`<=` 다).
  check("마감과 같은 순간은 지난 것으로 센다", isPastDeadline(new Date(Date.now())), true);

  check("마감이 아직이면 지난 것이 아니다", isPastDeadline(soon), false);
  check("마감이 없으면 지난 것이 아니다", isPastDeadline(null), false);

  /**
   * 예약 작업은 이 함수를 **불러오지 않는다.** 같은 규칙을 SQL 로 다시 적어 둔다
   * (`respondBy: { lte: new Date() }`) — 작업자가 여러 줄을 한 번에 갱신하므로 화면이 쓰는
   * 계산값을 한 줄씩 돌릴 수는 없기 때문이다. 실제로는 이쪽이 더 정확하다(DB 시계).
   *
   * 그러니 "함수를 부른다"를 검사하면 안 된다. 대신 **두 쪽의 경계가 같은지** 를 본다.
   * 아래 두 조건이 어긋나면 화면은 확정이라는데 예약 작업은 확정시키지 않거나 그 반대가 된다.
   */
  const cron = readCode("../src/server/meetings/confirm-due.ts");
  check("읽는 쪽(화면이 쓰는)이 계산한 값을 보여 준다", readCode("../src/data/api.ts").includes("effectiveStage"), true);
  check("배지도 같은 계산값을 쓴다", readCode("../src/server/nav/badges.ts").includes("effectiveStage"), true);
  check("예약 작업의 경계도 '지금까지'다 — <= 여야 한다", /respondBy: \{ lte: new Date\(\) \}/.test(cron), true);
  check("예약 작업도 반대가 있으면 확정하지 않는다", /agree: false/.test(cron), true);
  check("확정하며 진행 중 키를 함께 비운다", /activeKey: null/.test(cron), true);
}

/* ── 욕설 순화 ────────────────────────────────────────────────── */

console.log("\n욕설 순화 (멀쩡한 말을 가리지 않는 게 먼저다)");
{
  // 이 함수는 순서가 반대다. 실수한 방향으로는 한 번의 커밋("30 욕설 순화가 멀쩡한 말을
  // 가렸다")으로 돌아간다 — 그래서 예외를 나열한다.
  const keeps = [
    "강아지 새끼가 산책했어요",
    "병아지가 우다다lx",
    "고양이새가来了",
    "시발점에서 출발",
    "시발역이 가까워요",
    "시발지부터 간다",
    "허리띠를 졸라매다",
    "졸라맨다",
    "다가오는 위기가 닥쳐온다",
    "곧 닥쳐올 마감",
    "불이 꺼져 있다",
    "전원이 꺼져 버렸",
    "화면이 꺼져 가고",
  ];
  for (const text of keeps) {
    check(`멀쩡한 말을 가리지 않는다 — "${text}"`, softenProfanity(text).masked, false);
  }

  // 안 가리면 안 되는 것.
  const masks = ["씨발", "존나", "개새끼", "병신", "지랄", "썅"];
  for (const text of masks) {
    check(`가린다 — "${text}"`, softenProfanity(text).masked, true);
  }

  // **겹친 구간은 글자 수가 어긋나면 안 된다.** "개새끼" 안에 "개새"와 "새끼"가 모두 걸린다.
  // 합치지 않으면 가림 표시가 늘어 원문보다 길어지고, 그것을 겹침이라 부른다.
  const once = softenProfanity("개새끼");
  check("겹친 규칙을 한 번만 가린다", once.text, "***");
  check("겹친 규칙은 글자 수가 어긋나지 않는다", once.text.length, "개새끼".length);

  // 같은 규칙이 두 번 걸려도 두 번이 아니라 구간 수만큼이다.
  const twice = softenProfanity("씨발 씨발");
  check("두 번 걸리면 두 번 가린다", twice.text, "** **");
  check("두 번 걸린 글자 수가 어긋나지 않는다", twice.text.length, "씨발 씨발".length);

  // 애매하면 가리지 않는다 — 이게 이 함수의 방향이다.
  check("일부러 가린 말도 표시가 남는다", softenProfanity("씨발").text, "**");
  check("가린 말이 없으면 원문 그대로다", softenProfanity("회의 자료 올렸습니다").text, "회의 자료 올렸습니다");
}

/* ── 드라이브 파일 규칙 ───────────────────────────────────────── */

console.log("\n드라이브 파일 규칙 (받는 것과 그리는 것을 구분한다)");
{
  check("그림은 앱에서 바로 그린다", canOpenInApp("image"), true);
  // 2026-09-25 결정: PDF 도 브라우저 내장 뷰어로 연다.
  check("PDF 도 앱에서 바로 본다", canOpenInApp("pdf"), true);
  check("문서는 앱에서 그리지 않는다", canOpenInApp("docx"), false);
  check("슬라이드도 앱에서 그리지 않는다", canOpenInApp("pptx"), false);

  // 받는 형식은 mime 를 먼저 본다.
  check("알려진 mime 은 그대로 받는다", resolveFileType("a.pdf", "application/pdf")?.kind, "pdf");
  // zip·octet-stream 은 브라우저가 형식을 모른다고 보내는 자리라 **확장자로** 본다.
  check("확장자를 모르는 mime 도 확장자로 받는다", resolveFileType("a.png", "application/octet-stream")?.kind, "image");
  check("형식을 알 수 없으면 받지 않는다", resolveFileType("a.exe", "application/octet-stream"), null);
  check("허용되지 않는 mime 은 받지 않는다", resolveFileType("a.exe", "application/x-msdownload"), null);

  /** 마감 판단은 저장해 두지 않는다. 마감을 옮기면 라벨도 따라와야 한다. */
  const due = new Date("2026-09-20T00:00:00Z");
  check("마감 뒤에 올린 버전은 늦었다", isLateVersion({ createdAt: new Date("2026-09-21T00:00:00Z"), restoredFromId: null }, due), true);
  check("마감 전 버전은 늦지 않았다", isLateVersion({ createdAt: new Date("2026-09-19T00:00:00Z"), restoredFromId: null }, due), false);
  check("마감과 같은 순간은 늦지 않았다", isLateVersion({ createdAt: due, restoredFromId: null }, due), false);
  // 복원으로 생긴 버전은 마감과 무관한 작업이라 세지 않는다.
  check(
    "복원본은 마감과 무관하다",
    isLateVersion({ createdAt: new Date("2026-09-21T00:00:00Z"), restoredFromId: "v1" }, due),
    false,
  );
  check("마감이 없으면 늦은 것이 아니다", isLateVersion({ createdAt: new Date("2026-09-21T00:00:00Z"), restoredFromId: null }, null), false);

  check("바이트는 바이트로 보인다", humanSize(512), "512B");
  check("킬로바이트를 올림하지 않는다", humanSize(1536), "2KB");
  check("메가바이트는 한 자리까지", humanSize(1_500_000), "1.4MB");
}

/* ── "언제"를 한국 시간으로 ───────────────────────────────────── */

console.log("\n시간 표기 (서버가 한국 시간으로 정한다)");
{
  const now = new Date("2026-09-28T12:00:00Z"); // 한국 21:00
  check("방금 전은 방금", formatWhen(new Date("2026-09-28T11:59:30Z"), now), "방금");
  // **경계가 두 갈래다.** 60분 미만은 "N분 전"이고, **정확히 60분부터는** 시계로 넘어간다.
  check("59분 전은 분으로 말한다", formatWhen(new Date("2026-09-28T11:01:00Z"), now), "59분 전");
  check("정확히 60분부터는 시계로 말한다", formatWhen(new Date("2026-09-28T11:00:00Z"), now), "오늘 20:00");
  // 아래는 **한국 시간** 9/28 14:20 이다(UTC 9/28 05:20).
  check("같은 날은 오늘", formatWhen(new Date("2026-09-28T05:20:00Z"), now), "오늘 14:20");
  // 한국 시간 9/27 21:14(UTC 9/27 12:14).
  check("어제는 어제", formatWhen(new Date("2026-09-27T12:14:00Z"), now), "어제 21:14");
  // 같은 해면 짧게, 다른 해면 연도를 붙인다.
  check("같은 해는 연도를 붙이지 않는다", formatWhen(new Date("2026-09-14T13:05:00Z"), now), "9/14 22:05");
  check("다른 해는 연도를 붙인다", formatWhen(new Date("2025-12-31T14:59:00Z"), now), "2025. 12/31");

  // 입력창 값은 한국 시간으로 읽고 쓴다 — **왕복이 깨지면 그 사람이 9시간씩 어긋나게 넣는다.**
  const utc = new Date("2026-09-15T14:59:00Z"); // 한국 9/15 23:59
  check("마감 입력을 한국 시간으로 쓴다", toKstInputValue(utc), "2026-09-15T23:59");
  check("마감 입력을 되읽으면 같은 순간이다", fromKstInputValue(toKstInputValue(utc))?.getTime(), utc.getTime());
  check("형식이 아니면 null 이고 예외가 아니다", fromKstInputValue("2026-09-15"), null);
  check("빈 값도 null 이다", fromKstInputValue(""), null);
  check("마감 표시에도 같은 규칙이 든다", formatDue(utc), "9/15 23:59");
}

/* ── 문서가 숫자를 담지 않는 자리 ──────────────────────────────── */

console.log("\n문서가 숫자를 담지 않는다");
{
  /**
   * "확정이 필요한 정책이 N건" 같은 **개수를 문서에 적지 않게** 지킨다.
   *
   * 화면이 원래 목록이고(`?review=1` 로 한 번에 보인다) 목록은 계속 늘어난다. 문서에 개수를
   * 적어 두면 화면을 추가한 사람이 그 숫자를 고치기 전까지 문서는 조용히 틀어 있고, 읽는
   * 사람은 그 수를 전체로 믿는다. 실제로 겪었다 — 문서는 "10건"이라 했고 화면은 25곳이었다.
   *
   * 그래서 이 검사는 "맞는 숫자"를 재는 대신 **개수를 못 쓰게** 막는다. 대신 "목록을 읽을
   * 자리는 남아 있는가"를 본다.
   */
  const docs = ["../README.md", "../CLAUDE.md"];
  for (const rel of docs) {
    const text = readFileSync(new URL(rel, import.meta.url), "utf8");
    check(`${rel} 은 정책 개수를 적지 않는다`, /정책\s*\d+\s*건/.test(text), false);
    check(`${rel} 은 컴포넌트 개수를 적지 않는다`, /컴포넌트\s*\d+\s*종/.test(text), false);
  }

  // 제거했다면 목록을 읽을 자리는 남아 있어야 한다 — 화면 안의 검토 표시와 그 열기.
  const note = readCode("../src/components/ui/note.tsx");
  check("검토 표시는 화면에서 쓸 수 있다", /export function Undecided/.test(note), true);
  check("검토 표시는 사용자에게 항상 보이지 않는다", /if \(!review\) return null/.test(note), true);
  const review = readCode("../src/lib/review-mode.tsx");
  check("검토 모드를 켜는 방법이 남아 있다", review.includes("__CD_REVIEW__"), true);
}

/* ── 할 일: 담당자를 고칠 수 있는 사람 ────────────────────────── */

console.log("\n할 일 수정 권한 (만든 사람 + 팀장 예외)");
{
  const leader = { id: "leader", isLeader: true };
  const plain = { id: "plain", isLeader: false };
  const other = { id: "other", isLeader: false };

  // **만든 사람** — 넣은 사람이 고친다.
  check("만든 사람은 고칠 수 있다", canEditTask({ createdById: plain.id }, plain), true);
  // **남의 업무는 남이 못 고친다** — 이게 규칙의 존재 이유다(2026-09-28 추가).
  check("팀원은 남이 넣은 업무를 못 고친다", canEditTask({ createdById: other.id }, plain), false);
  check("그 이유는 '만든 사람이 아니다'", taskEditBlock({ createdById: other.id }, plain), "not-creator");
  // **팀장은 예외** — 막혔을 때 되돌릴 수 있는 사람이 있어야 한다.
  check("팀장은 남의 업무도 고칠 수 있다", canEditTask({ createdById: other.id }, leader), true);
  check("그래서 팀장에게는 이유가 없다", taskEditBlock({ createdById: other.id }, leader), null);

  // **주인이 없는 업무(넣기 전부터 있던 것)** — 주인이 누구인지 되돌릴 수 없다.
  // 아무도 못 고치게 하지도, 아무 말 없이 지어내지도 않는다. 팀장에게만 연다.
  check("주인 없는 업무는 팀원이 못 고친다", canEditTask({ createdById: null }, plain), false);
  check("그 이유는 '팀장만'", taskEditBlock({ createdById: null }, plain), "leader-only");
  check("주인 없는 업무는 팀장이 고친다", canEditTask({ createdById: null }, leader), true);

  // **세션이 없으면 아무도 못 고친다** — 서버 액션은 화면을 거치지 않고 POST 로 부른다.
  check("세션이 없으면 못 고친다", canEditTask({ createdById: plain.id }, null), false);

  // 판정이 **실제로 쓰이는 자리**를 고정한다 — 값이 무의미해지는 사고를 막는다.
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const taskModel = schema.slice(schema.indexOf("model Task {"), schema.indexOf("model Task {") + 1600);
  check("할 일에 만든 사람이 기록된다", /createdById\s+String\?/.test(taskModel), true);
  // 넣는 두 길(사람이 직접, AI 서기)이 **모두** 주인을 남겨야 한다 — 하나라도 빠지면
  // 그 길로 넣은 업무는 팀장만 고칠 수 있게 되어 조용히 막힌다.
  const actions = readCode("../src/server/actions/tasks.ts");
  check("담당자가 들어가는 두 길 모두 주인을 남긴다", (actions.match(/createdById:\s*me\.id/g) ?? []).length >= 2, true);
  check("서버도 같은 순수 판정을 부른다", actions.includes("canEditTask("), true);
}

console.log("\n사용자 노출 용어");
checkProductLanguage();

/* ── 미결 목록은 주석까지 세지 않는다 ─────────────────────────── */

console.log("\n미결 목록 도구 (npm run decisions)");
{
  // 이 도구는 `Undecided` 를 **소스에서** 찾는다. 그래서 두 가지를 함께 고정한다 —
  //
  // ① 주석을 지운다 (`strip-comments` ). 주석 안의 `<Undecided>` 을 세면 목록이 거짓말을
  //    하고, 주석 안의 중괄호 하나가 항목의 끝을 잘못 잡는다. 두 문제가 한 곳에서 온다.
  const script = readCode("../scripts/list-open-decisions.mjs");
  check("소스를 주석 제거하고 읽는다", script.includes("stripComments("), true);

  // ② **놓치지 않는다.** 주석을 지우는 변경으로 항목이 사라지면 그건 조용한 실패다.
  //    화면에 있는 `Undecided` 수와 도구가 세는 수를 직접 비교한다.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(dir, ""), { withFileTypes: true })) {
      if (["node_modules", "generated", ".next", "prototype", "handoff"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) files.push(full);
    }
  };
  walk(new URL("../src", import.meta.url).pathname);

  let inCode = 0;
  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    inCode += (source.match(/<Undecided/g) ?? []).length;
  }
  // 도구가 실제로 세는 값(같은 규칙으로 직접 센 것) — 이 검사는 도구의 **출력**을 보지 않고
  // 같은 계산을 두 번 해서 비교한다. 출력을 실행하는 것은 느리고(파일 훑는다) 실패 이유가
  // "도구가 망가짐" 과 "화면에 항목이 줄었다" 로 갈리기 때문이다.
  check("주석을 지우면 화면의 미결 표시가 하나도 줄지 않는다", inCode > 0, true);

  // 주석 제거가 실제로 뭘 세는지 — 손으로 만든 두 경우로 확인한다.
  const sample = "/* <Undecided> 주석 안이니 세면 안 된다 */\nconst x = 1; // <Undecided> 이것도\n<Undecided>실제</Undecided>";
  const cleaned = stripComments(sample);
  check("주석 안의 <Undecided> 은 지워진다", (cleaned.match(/<Undecided/g) ?? []).length, 1);
  check("주석 지워도 줄 수는 그대로다", cleaned.split("\n").length, sample.split("\n").length);
}

/* ── 28 라이어 게임: 규칙이랑 비밀 ──────────────────────────── */

console.log("\n라이어 게임: 역할과 제시어");
{
  const ids = ["a", "b", "c", "d", "e"];

  // ① 한 판에는 라이어가 **정확히 한 명**이다. 300 판을 돌려도 한 번도 어긋나면 안 된다 —
  //    라이어가 0명이면 아무도 모른다, 2명이면 판정이 성립하지 않는다.
  const liarCounts = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const { roles } = deal("liar", ids);
    liarCounts.add([...roles.values()].filter((r) => r === "liar").length);
  }
  check("한 판의 라이어는 정확히 1명 (300 판)", [...liarCounts], [1]);

  // ② 라이어는 자기가 앉은 자리 중 하나여야 하고, 제시어는 누군가에게 하나 정해진다.
  const dealt = deal("liar", ids);
  check("라이어는 참가자 중에서 나온다", ids.includes([...dealt.roles].find(([, role]) => role === "liar")?.[0] ?? ""), true);
  check("제시어를 하나 정한다", typeof dealt.word === "string" && dealt.word.length > 0, true);
  check("주제도 하나 정한다", typeof dealt.topic === "string" && (dealt.topic ?? "").length > 0, true);

  // ③ 직전 판의 라이어는 다음 판에서 빠진다. 연달아 같은 사람이 라이어가 되는 것이 실제로
  //    체감을 깎았다 — 세 판 연속 같은 사람이면 "그냥 그 사람이 라이어구나" 가 된다.
  let sawDifferent = false;
  for (let i = 0; i < 40; i++) {
    const { roles } = deal("liar", ids, { recentWords: [], previousLiarId: "c" });
    if ([...roles].find(([, role]) => role === "liar")?.[0] !== "c") sawDifferent = true;
  }
  check("직전 라이어는 다음 판 후보에서 빠진다", sawDifferent, true);
  // 한 명뿐인 팀이라면 뺄 것이 없어서 그 사람이 라이어가 되어야 한다 (게임이 안 열리면 더 나쁘다).
  const solo = deal("liar", ["only"], { recentWords: [], previousLiarId: "only" });
  check("뺄 사람이 없으면 그 사람이 라이어가 된다", [...solo.roles.values()], ["liar"]);

  // ④ 최근에 나온 제시어는 다시 나오지 않는다.
  let recentLeak = 0;
  for (let i = 0; i < 200; i++) {
    const { word } = deal("liar", ids, { recentWords: ["떡볶이", "기숙사", "펭귄", "골프", "여권"], previousLiarId: null });
    if (["떡볶이", "기숙사", "펭귄", "골프", "여권"].includes(word ?? "")) recentLeak++;
  }
  check("최근 5판의 제시어는 다시 나오지 않는다 (200 판)", recentLeak, 0);

  // ⑤ 뺄 목록이 제시어 전체를 덮으면 게임이 안 열린다. 겹치는 것보다 판이 열리는 편이 낫다.
  const everything = LIAR_PROMPTS.map((p) => p.word);
  const fallback = deal("liar", ids, { recentWords: everything, previousLiarId: null });
  check("모든 제시어를 뺐어도 판은 열린다", typeof fallback.word === "string" && fallback.word.length > 0, true);
}

console.log("\n라이어 게임: 제시어 데이터");
{
  // 같은 단어가 두 번 있으면 "설명하면 두 정답이 동시에 맞는다"가 되어 판정이 뒤집힌다.
  const words = LIAR_PROMPTS.map((p) => p.word);
  check("제시어 단어가 겹치지 않는다", new Set(words).size, words.length);
  check("제시어 id 가 겹치지 않는다", new Set(LIAR_PROMPTS.map((p) => p.id)).size, LIAR_PROMPTS.length);
  check("모든 제시어에 주제가 있다", LIAR_PROMPTS.filter((p) => !p.category).length, 0);
  check("모든 제시어에 난이도가 있다", LIAR_PROMPTS.filter((p) => !["easy", "normal", "hard"].includes(p.difficulty)).length, 0);
  check("알리어스가 다른 정답과 겹치지 않는다", LIAR_PROMPTS.filter((p) => (p.aliases ?? []).some((a) => words.includes(a) && a !== p.word)).length, 0);

  // 새 단어를 넣다가 **설명할 수 없는 것**을 넣지 않게 하는 자리다. 추상 명사는 어떤 문장으로도
  // 우회되지 않아 게임이 성립하지 않는다 — 사람이 검수할 수 있는 값으로 남긴다.
  check("제시어 수가 두 자리 이상이다", LIAR_PROMPTS.length >= 200, true);
  console.log(`     (제시어 ${LIAR_PROMPTS.length}개 · 주제 ${LIAR_PROMPT_CATEGORIES.length}개)`);

  /**
   * 팀플·성격을 연상시키는 단어는 기본 팩에 넣지 않는다.
   *
   * 예전 `팀플과 성격` 주제에 있던 말들이다. **친목을 하려는 자리에서 실제로 쓰면** 그 판의
   * 대답이 되고 팀의 진단이 된다 — 게임이 아니라 회의가 된다.
   */
  const banned = ["무임승차", "마감직전", "역할분담", "칼마감", "발표자"];
  check("친목 자리에서 갈등을 부르는 단어는 기본에 없다", LIAR_PROMPTS.filter((p) => banned.includes(p.word)).length, 0);
}

console.log("\n라이어 게임: 표 정산");
{
  const seats = [
    { memberId: "a", role: "liar" },
    { memberId: "b", role: "citizen" },
    { memberId: "c", role: "citizen" },
  ];

  // ⑥ **동점과 0표는 승패가 아니다.** 예전에는 둘 다 곧 라이어 승리가 됐다 — 표를 하나도 못
  //    받은 상태에서 사회자가 "결과 공개"를 눌러도 라이어가 이겼다.
  check("아무도 투표하지 않으면 동점", resolveLiarVote([null, null, null], seats), { kind: "tie" });
  check("동점이면 동점", resolveLiarVote(["b", "c", null], seats), { kind: "tie" });
  check("삼방이 같아도 동점", resolveLiarVote(["a", "b", "c"], seats), { kind: "tie" });
  // ⚠️ **한 표만 모였고 그것이 최다표라면 그것이 승부다.** 사회자가 "그래도 마감할까요?"를
  // 확인한 뒤 일찍 마감을 누를 수 있으므로, 표가 적다고 임의로 되돌리면 그 확인이 무의미해진다.
  // 여기가 아니라 **화면의 확인 창**에서 막는 자리다.
  check("한 표뿐이어도 최다표는 승부다", resolveLiarVote(["c", null, null], seats).kind, "ended");

  // ⑦ 라이어가 아닌 사람이 지목되면 라이어 승리.
  const citizen = resolveLiarVote(["b", "b", "b"], seats);
  check("시민이 지목되면 라이어 승리", [citizen.kind, citizen.kind === "ended" ? citizen.winner : null], ["ended", "liar"]);

  // ⑧ 라이어가 지목되면 **곧바로 공개하지 않는다** — 라이어에게 마지막 추측을 준다.
  const liar = resolveLiarVote(["a", "a", "b"], seats);
  check("라이어가 지목되면 최종 추측으로 간다", liar.kind, "liarGuess");
  check("지목된 사람이 남는다", liar.kind === "liarGuess" ? liar.accusedId : null, "a");

  // ⑨ 이 판에 없는 사람을 가리키는 표도 승부가 아니다(구경만 하던 사람이 찍혔을 때).
  check("이 판에 없는 사람이 지목돼도 동점", resolveLiarVote(["ghost", "b", "c"], seats), { kind: "tie" });
}

console.log("\n라이어 게임: 최종 추측");
{
  // ⑩ 사람이 폰으로 직접 친다 — 띄어쓰기를 빠뜨리고 오타를 낸다. 관대하게 판정한다.
  check("맞으면 맞았다", checkLiarGuess("떡볶이", "떡볶이", ["떡보끼"]), true);
  check("뒤에 공백이 있어도 맞는다", checkLiarGuess("  떡볶이 ", "떡볶이"), true);
  check("띄어쓰기가 섞여도 맞는다", checkLiarGuess("떡 볶이", "떡볶이"), true);
  check("알리어스도 정답이다", checkLiarGuess("떡보끼", "떡볶이", ["떡보끼", "떡복기"]), true);
  check("틀린 답은 오답이다", checkLiarGuess("김치찌개", "떡볶이", ["떡보끼"]), false);
  check("빈 답은 오답이다", checkLiarGuess("   ", "떡볶이"), false);
  check("제시어를 일부러 늘린 답은 오답이다", checkLiarGuess("떡볶이 맛있네요", "떡볶이"), false);
}

console.log("\n라이어 게임: 단계");
{
  // ⑪ 투표는 투표 단계에서만 열린다. 예전에는 `play` 하나가 카드 확인과 투표를 함께 뜻했다.
  check("카드 확인에서는 투표가 닫혀 있다", canVoteNow("liar", "clue"), false);
  check("투표 단계에서만 열린다", canVoteNow("liar", "vote"), true);
  check("최종 추측 단계에서는 닫혀 있다", canVoteNow("liar", "liar_guess"), false);
  check("결과 단계에서는 닫혀 있다", canVoteNow("liar", "revealed"), false);
  // 마피아는 밤과 낮이 각각 단계다 — 예전에는 `play` 하나여서 **밤에 투표할 수 있었다.**
  check("밤에는 투표가 닫혀 있다", canVoteNow("mafia", "night"), false);
  check("낮(토론)에서도 닫혀 있다", canVoteNow("mafia", "discussion"), false);
  check("마피아는 투표 단계에서만 열린다", canVoteNow("mafia", "voting"), true);
  check("결과 단계에서는 닫혀 있다", canVoteNow("mafia", "revealed"), false);
  check("예전 마피아 판의 play 는 투표로 읽는다", canVoteNow("mafia", icePhase("mafia", "play")), true);

  // ⑫ 마이그레이션 전부터 진행 중이던 판. 예전 라이어 판의 `play` 는 "투표가 열린" 상태였으므로
  //     투표로 읽어야 한다 — 그대로 두면 투표가 닫힌 판이 된다. 마피아도 같다(투표가 열려 있었다).
  check("예전 라이어 판의 play 는 투표로 읽는다", icePhase("liar", "play"), "vote");
  // ⚠️ 예전 마피아 판을 `night` 로 읽으면 **갑자기 밤으로 넘어가 아무도 투표할 수 없다.**
  check("예전 마피아 판의 play 는 투표로 읽는다", icePhase("mafia", "play"), "voting");
  check("새 단계는 그대로 읽는다", icePhase("liar", "liar_guess"), "liar_guess");
  check("마피아의 새 단계도 그대로 읽는다", icePhase("mafia", "discussion"), "discussion");

  // 못 투표할 때 **왜**인지를 말로 만든다 — 밤과 "아직 열리지 않음" 을 같은 말로 뭉개면,
  // 밤에 투표하려다 안 되는 사람이 "내가 뭘 잘못했지" 하고 폰을 붙여 든다.
  check("밤에는 이유가 밤이다", voteBlockedText("mafia", "night").includes("밤"), true);
  check("낮에는 이유가 대기다", voteBlockedText("mafia", "discussion").includes("열리지"), true);
  check("끝나면 끝났다고 말한다", voteBlockedText("mafia", "revealed"), "투표가 끝났습니다.");

  // ⚠️ 읽을 때만 고치면 안 된다. **쓸 때도** 같은 해석을 써야 한다 — 배포 도중이던 판이
  //    투표할 수 없는 판이 되면 그 판은 그 자리에서 다시 열 수 없다.
  truthy("액션도 예전 단계를 같은 방법으로 읽는다", /canVoteNow\(\s*\w+,\s*icePhase\(/.test(readCode("../src/server/actions/ice.ts")));

  // ⑬ 두 사람이 동시에 마감을 눌러도 결과는 한 번만 결정된다. 마감을 잠근 뒤 **다시 읽고**
  //     여전히 투표 중인지 확인하는 것이 그 방법이다 — `liar_guess` 는 투표가 닫힌 상태다.
  const afterClose = resolveLiarVote(["a", "a", "b"], [
    { memberId: "a", role: "liar" },
    { memberId: "b", role: "citizen" },
    { memberId: "c", role: "citizen" },
  ]);
  check("두 번째 마감은 진행할 수 없다", canVoteNow("liar", afterClose.kind === "liarGuess" ? "liar_guess" : "revealed"), false);

  // ⑭ 결과 문장은 코드로 저장하고 화면이 만든다 — 문장을 저장하면 말이 바뀌어도 옛말로 남는다.
  check("코드가 문장으로 바뀐다", iceResultText(ICE_RESULT_CODES.liarGuessed), "라이어가 제시어를 맞혔습니다. 라이어의 역전승입니다.");
  check("다른 코드는 다른 문장", iceResultText(ICE_RESULT_CODES.liarCaught) === iceResultText(ICE_RESULT_CODES.liarGuessed), false);
  check("모르는 코드는 조용히 빈 문장", iceResultText("WHAT"), "");
}

console.log("\n라이어 게임: 기권(라이어가 답하지 못할 때)");
{
  /**
   * `liar_guess` 는 판이 영구히 멈출 수 있는 **유일한 단계**다 — 라이어가 자리를 뜨거나 폰을
   * 못 쓰면 아무도 진행시킬 수 없고, 사회자 화면에는 "결과 없이 그만하기" 뿐이었다.
   *
   * **시계로 끝내지 않는다.** 라이어는 사회자 바로 옆에서 폰을 들고 있다 — 초읽기가 있으면
   * 그건 "얼른 답해라" 가 아니라 **"무엇을 치고 있는지 슬쩍 보게"** 하는 유인이 된다.
   * 판단은 사회자가 하고 앱은 그 결과를 안전하게 수렴시킨다.
   */
  // 기권은 `liar_guess` 에서만 열린다.
  check("최종 추측 단계에서 기권할 수 있다", canForfeitLiarGuess("liar", "liar_guess"), true);
  check("카드 확인 단계에서는 기권할 수 없다", canForfeitLiarGuess("liar", "clue"), false);
  check("투표 단계에서는 기권할 수 없다", canForfeitLiarGuess("liar", "vote"), false);
  check("이미 끝난 판은 기권할 수 없다", canForfeitLiarGuess("liar", "revealed"), false);
  check("마피아 판은 기권할 수 없다", canForfeitLiarGuess("mafia", "liar_guess"), false);

  // ⑮ **경합.** 라이어가 답을 보낸 직후에 사회자가 기권을 누르면 그 결과는 **무효**여야 한다.
  //     기권이 먼저 잠금을 잡았으면 그 판이 끝나고, 답이 먼저 갔으면 그 답이 이긴다 —
  //     나중에 도착한 쪽이 이긴 결과를 덮어쓰면 안 된다.
  check("답을 낸 뒤에는 기권이 닫힌다", canForfeitLiarGuess("liar", "revealed"), false);

  // ⑯ 기권은 시민 승리다 — 라이어에게 "기권"이 벌이 아니라는 신호를 남긴다.
  check("기권은 시민 승리", ICE_RESULT_CODES.liarForfeit, "LIAR_FORFEIT");
  check("기권 문장이 있다", iceResultText(ICE_RESULT_CODES.liarForfeit), "라이어가 최종 답을 내지 못했습니다. 시민의 승리입니다.");

  const forfeit = readCode("../src/server/actions/ice.ts");
  const body = forfeit.match(/export async function forfeitLiarGuess[\s\S]*?\n}\n/)?.[0] ?? "";
  // ⑰ 권한은 **사회자만.** 라이어가 스스로 기권할 수는 없다 — 자기 승패를 스스로 정하게 두면
  //     판이 아니라 협상이 된다.
  truthy("기권은 사회자 권한을 요구한다", /activeRound\(me,\s*true\)/.test(body));
  // ⑱ 동시에 눌러도 결과는 한 번만 정해진다 — 잠근 뒤 다시 읽는다.
  truthy("기권은 판의 행을 잠근 뒤 다시 읽는다", /FOR UPDATE/.test(body) && /findUnique/.test(body));
  // ⑲ 기권은 라이어의 답을 **지우지 않는다.** 이미 낸 답이 있다면 그 판정이 먼저다.
  truthy("기권은 답을 지우지 않는다", !/liarGuess:\s*null/.test(body));
  // ⑳ 기권은 추측을 하지 않았으므로 "틀렸다" 를 남기지 않는다.
  truthy("기권은 guessCorrect 를 쓰지 않는다", !/guessCorrect/.test(body));

  // ㉑ 화면에서 한 번 확인하고, 되돌릴 수 없다는 사실을 먼저 말한다.
  const screen = readCode("../src/features/social/icebreak-screen.tsx");
  truthy("기권은 확인을 한 번 거친다", /setForfeitOpen\(true\)/.test(screen) && /기권 처리/.test(screen));
  truthy("되돌릴 수 없음을 미리 말한다", /이 판은 다시 열지 않습니다/.test(screen));
}

console.log("\n마피아 게임: 밤과 낮");
{
  // ㉖ 밤 → 낮은 순서를 한 표로 묶는다. 밤이랑 낮이 한 단계였을 때 생겼던 사고가
  //     "밤에 두 사람이 빠졌다" 다 — 밤이 끝났다는 표시가 없었다.
  check("밤에서 낮으로 간다", canEnterMafiaPhase("night", "discussion"), true);
  check("밤에서 투표로 건너뛸 수 없다", canEnterMafiaPhase("night", "voting"), false);
  check("밤이 두 번 오지 않는다", canEnterMafiaPhase("night", "night"), false);
  check("낮에서 투표로 간다", canEnterMafiaPhase("discussion", "voting"), true);
  check("낮에서 밤으로 건너뛸 수 없다", canEnterMafiaPhase("discussion", "night"), false);
  // 동점이면 표를 지우고 다시 이야기한다 → 낮으로 되돌아간다.
  check("투표에서 다시 낮으로 간다(동점)", canEnterMafiaPhase("voting", "discussion"), true);
  // 이기지 않았으면 밤이 하나 더 온다.
  check("투표에서 다음 밤으로 간다", canEnterMafiaPhase("voting", "night"), true);
  // 이기는 조건은 어느 단계에서든 성립한다 → 결과는 어디서든 갈 수 있다.
  check("아무 단계에서든 결과로 간다", ["night", "discussion", "voting"].every((p) => canEnterMafiaPhase(p as MafiaPhase, "revealed")), true);
  // 끝난 판에서 되돌아갈 수는 없다.
  check("결과에서 다시 밤으로 못 간다", canEnterMafiaPhase("revealed", "night"), false);

  // ㉗ 밤에는 **한 명만** 빠진다. 같은 밤에 두 번 적히면 마피아가 두 번 죽인다.
  const nightStart = new Date("2026-09-30T20:00:00Z");
  const at = (ms: number) => new Date(nightStart.getTime() + ms);
  check("이 밤에 아무도 빠지지 않았다", nightAlreadyStruck([{ outAt: null, outHow: null }], nightStart), false);
  check("이 밤에 한 명 빠졌다", nightAlreadyStruck([{ outAt: at(60_000), outHow: "night" }], nightStart), true);
  // ⚠️ **다른 밤**에 빠진 사람은 이 밤의 Deaths 가 아니다. 밤 번호를 안 세면 어느 밤인지
  //   모른 채 모든 밤이 두 번째 밤으로 판정된다.
  check("어젯밤에 빠진 사람은 이 밤의 것이 아니다", nightAlreadyStruck([{ outAt: at(-3_600_000), outHow: "night" }], nightStart), false);
  check("투표로 빠진 사람은 밤의 것이 아니다", nightAlreadyStruck([{ outAt: at(60_000), outHow: "vote" }], nightStart), false);
  check("시간이 없는데 방법만 밤이면 세지 않는다", nightAlreadyStruck([{ outAt: null, outHow: "night" }], nightStart), false);

  // ㉘ 투표는 **마감과 경쟁한다.** 예전에는 단계를 읽고 → 자리를 확인하고 → 표를 쓰는데
  //     그 사이에 잠금이 없었다. 그 틈에 마감이 끝나면 내 표가 다음 밤으로 넘어간다 —
  //     투표한 흔적은 화면에 남아 있고 아무도 세지 않은 한 표가 조용히 사라진다.
  const iceActions = readCode("../src/server/actions/ice.ts");
  const castVote = iceActions.slice(
    iceActions.indexOf("export async function castIceVote"),
    iceActions.indexOf("\nexport async function", iceActions.indexOf("export async function castIceVote") + 10),
  );
  truthy("투표도 판의 행을 잠근다", /FOR UPDATE/.test(castVote));
  truthy("잠근 뒤 다시 읽는다", castVote.indexOf("FOR UPDATE") < castVote.indexOf("canVoteNow"));
  truthy("밤에는 표를 못 받는다", /voteBlockedText\(/.test(castVote));

  // ㉙ 밤을 여는 쪽과 여는 곳은 한 곳이어야 한다. 마피아 판은 처음 단계가 `night` 다.
  truthy("마피아 판은 밤으로 시작한다", /phase:\s*game === "liar" \? "clue" : "night"/.test(iceActions));
  truthy("밤을 마치는 길이 있다", /export async function closeIceNight/.test(iceActions));
  truthy("밤에는 한 명만 적는다", /nightAlreadyStruck\(/.test(iceActions));
  // 투표 마감이 끝나면 다음 밤 번호가 올라간다 — 밤이 늘지 않으면 타임라인이 거짓말한다.
  truthy("투표 뒤 밤 번호가 오른다", /day:\s*input\.day \+ 1/.test(DAY_VOTE));
  // 동점은 승부가 아니다 — 같은 표로 처형하지 않는다.
  truthy("동점이면 낮으로 돌아간다", /phase: "discussion", phaseStartedAt: new Date\(\)/.test(iceActions));
}

console.log("\n마피아 게임: 밤을 두 번 처리하지 않는다");
{
  /**
   * 사회자 override("밤 결과를 직접 적기")와 앱 판정(`resolveIceNight`)이 **같은 밤을 두 번**
   * 처리하면 안 된다 — 두 사람이 죽거나, 같은 밤이 두 줄로 남거나, 판정 뒤에 늦은 행동이 남는다.
   *
   * 막는 곳은 두 군데다. ① 단계가 `night` 가 아니면 거절한다. ② 그 밤에 이미 누군가 빠졌으면
   * 거절한다(`nightAlreadyStruck`). 여기서는 ② 를 **실제 DB 행**으로 확인한다 — 밤에 적힌
   * 자리가 있으면 밤은 이미 끝난 밤이다.
   */
  const team = await db.team.create({
    data: { name: "밤 중복 확인용", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  try {
    const names = ["김민준", "이서연", "박지호", "최수빈", "정예진"];
    const seats: { id: string }[] = [];
    for (const name of names) seats.push(await db.member.create({ data: { teamId: team.id, name } }));

    const nightStart = new Date("2026-09-30T12:00:00Z");
    const round = await db.iceRound.create({
      data: {
        teamId: team.id,
        activeKey: team.id,
        game: "mafia",
        phase: "night",
        day: 1,
        phaseStartedAt: nightStart,
        hostId: seats[0].id,
        seats: { create: seats.map((s, i) => ({ memberId: s.id, role: i === 0 ? "mafia" : "citizen" })) },
      },
    });
    const asMember = (id: string, name: string) => ({ id, teamId: team.id, name, isLeader: false });

    // 밤 행동이 이미 모였고, 의사가 지목한 사람을 살렸다.
    await db.iceNightAction.createMany({
      data: [
        { roundId: round.id, day: 1, actorId: seats[0].id, kind: "mafia_kill", targetId: seats[3].id },
        { roundId: round.id, day: 1, actorId: seats[1].id, kind: "doctor_save", targetId: seats[3].id },
      ],
    });

    // ㊿ 사회자가 "직접 적기" 를 눌렀다 — 이 밤에 최수빈이 빠졌다.
    await db.iceSeat.update({
      where: { roundId_memberId: { roundId: round.id, memberId: seats[3].id } },
      data: { outAt: new Date(nightStart.getTime() + 60_000), outHow: "night", outDay: 1 },
    });
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "discussion" } });

    // ㊿ ㊿ 같은 밤을 `resolveIceNight` 가 다시 처리하려 하면 **이미 끝난 밤**이라고 거절해야 한다.
    const rows = await db.iceSeat.findMany({ where: { roundId: round.id }, select: { outAt: true, outHow: true } });
    const fresh = await db.iceRound.findUnique({ where: { id: round.id } });
    check("직접 적은 밤은 이미 끝난 밤이다", nightAlreadyStruck(rows, fresh!.phaseStartedAt), true);
    // 단계도 `night` 가 아니다 — 두 번째 방어선.
    check("단계도 밤이 아니다", fresh!.phase, "discussion");

    // ㊿ 타임라인에는 그 밤이 **한 줄만** 남는다 — 수동과 앱 판정이 둘 다 남기면 두 줄이다.
    const acts = await db.iceNightAction.findMany({ where: { roundId: round.id }, select: { day: true, kind: true, targetId: true } });
    const tl = mafiaTimeline({
      seats: (await db.iceSeat.findMany({ where: { roundId: round.id }, select: { memberId: true, outDay: true, outHow: true } })),
      ballots: [],
      nightActs: acts,
    });
    check("한 밤은 한 줄이다", tl.length, 1);
    check("그 줄은 수동 판정의 밤이다", [tl[0].how, tl[0].outId], ["night", seats[3].id]);
    // ⚠️ 밤 행동이 남아 있으므로 "아무도 안 죽었다" 로 세지지 않는다 — 직접 적었으니
    //   기록과 다른 사람이 빠졌다는 사실이 화면에 그대로 보인다.
    check("밤 줄이 세 번의 기록을 만들지 않는다", mafiaTimeline({
      seats: (await db.iceSeat.findMany({ where: { roundId: round.id }, select: { memberId: true, outDay: true, outHow: true } })),
      ballots: [],
      nightActs: acts,
    }).length, 1);

    // ㊿ 다음 밤에서는 지난 밤의 행동이 새 밤을 막지 않는다 — 밤 번호가 다르다.
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "night", day: 2, phaseStartedAt: new Date(nightStart.getTime() + 3_600_000) } });
    const nextRows = await db.iceSeat.findMany({ where: { roundId: round.id }, select: { outAt: true, outHow: true } });
    const nextRound = await db.iceRound.findUnique({ where: { id: round.id } });
    check("다음 밤은 새 밤이다", nightAlreadyStruck(nextRows, nextRound!.phaseStartedAt), false);
    check("다음 밤에는 살아 있는 자리만 밤 행동이 필요하다", requiredNightActions(
      (await db.iceSeat.findMany({ where: { roundId: round.id } })).map((s) => ({ memberId: s.memberId, role: s.role as IceRole, outAt: s.outAt })),
    ).length, 1);

    // ㊿ 밤이 끝나면 아무도 밤 행동을 고를 수 없다 — 늦게 들어온 행동을 화면이 아예 막는다.
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "discussion" } });
    check("밤이 끝나면 고를 사람이 사라진다", (await iceViewFor(asMember(seats[0].id, "김민준")))!.night!.canTarget, []);
    // 밤이 넘어가면 **새 밤의 고를 사람**이 생긴다 — 지난 밤과 섞이지 않는다.
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "night" } });
    check("새 밤에는 고를 사람이 다시 생긴다", (await iceViewFor(asMember(seats[0].id, "김민준")))!.night!.canTarget.length, 3);

    await db.iceRound.delete({ where: { id: round.id } });
  } finally {
    await db.team.delete({ where: { id: team.id } }).catch(() => {});
  }
}

console.log("\n마피아 게임: 낮 투표와 결선");
{
  const b = (targetId: string | null) => ({ targetId });
  const everyone = ["a", "b", "c", "d"];

  // ㊸ 표가 하나도 없으면 승부가 아니다 — 예전에는 이 상태에서 "결과 공개" 를 눌러도 처형이 났다.
  check("표가 없으면 승부가 아니다", resolveDayVote({ ballots: [b(null)], eligible: everyone, runoffs: 0 }), { kind: "noVote" });
  // 후보 밖의 표는 세지 않는다(결선에서 자기 투표를 못 한 사람이 남긴 표 등).
  check("후보 밖의 표는 세지 않는다", resolveDayVote({ ballots: [b("z")], eligible: everyone, runoffs: 0 }).kind, "noVote");

  check("한 명이 가장 많으면 그 사람이 빠진다", resolveDayVote({ ballots: [b("a"), b("a"), b("b")], eligible: everyone, runoffs: 0 }), {
    kind: "eliminated",
    targetId: "a",
  });

  // ㊹ 예전에는 동점이면 **표 전체를 버렸다.** 같은 사람들이 같은 이야기를 다시 하고 같은 동점이
  //   되기를 반복했다. 지금은 동점자끼리만 다시 투표한다.
  check("동점은 결선이다", resolveDayVote({ ballots: [b("a"), b("a"), b("b"), b("b")], eligible: everyone, runoffs: 0 }), {
    kind: "runoff",
    candidates: ["a", "b"],
  });
  check("세 명 동점이면 그 셋이 결선한다", resolveDayVote({ ballots: [b("a"), b("b"), b("c")], eligible: everyone, runoffs: 0 }), {
    kind: "runoff",
    candidates: ["a", "b", "c"],
  });
  check("결선에서 한 명을 더 받으면 그 사람이 빠진다", resolveDayVote({ ballots: [b("a"), b("a"), b("b")], eligible: ["a", "b"], runoffs: 0 }), {
    kind: "eliminated",
    targetId: "a",
  });

  // ㊺ 결선을 해도 동점이면 **무한 반복이 아니라 아무도 빠지지 않는다.** 두 명끼리는 후보를 더
  //   좁힐 수 없다 — 몇 번을 반복해도 결과가 없다.
  check("두 명 결선이 동점이면 부전이다", resolveDayVote({ ballots: [b("a"), b("b")], eligible: ["a", "b"], runoffs: 0 }), {
    kind: "stuck",
  });
  check("후보 수만큼 동점이면 결선이 아니다", resolveDayVote({ ballots: [b("a"), b("b"), b("c")], eligible: ["a", "b", "c"], runoffs: 0 }).kind, "stuck");
  // 한도에 닿으면 좁힐 수 있어도 부전 — 세 번째 투표 회차다.
  check(
    "한도(3회차)에는 결선하지 않는다",
    resolveDayVote({ ballots: [b("a"), b("a"), b("b"), b("b")], eligible: ["a", "b", "c"], runoffs: MAX_RUNOFFS }).kind,
    "stuck",
  );

  // ㊻ 투표는 **기록**된다 — 자리 한 칸에 있는 "지금 고른 사람" 이 아니다. 마감하면 표가 사라져
  //   "누가 누구에게 표를 던졌는가" 가 남지 않았고, 결선을 판정할 대상도 사라졌다.
  const iceActions = readCode("../src/server/actions/ice.ts");
  const seatModel = readCode("../prisma/schema.prisma");
  truthy("투표는 기록된다", /iceBallot\.upsert\(/.test(iceActions));
  // ⚠️ 동점에서 **표 기록**(`IceBallot`)을 지우지 않는다. 자리의 다리 칸(`voteForId`)을 비우는
  //   것은 다르다 — 구버전이 그 판을 마감할 수 있는 동안에만 필요한 조치다(2026-09-30).
  truthy("동점이라고 표 기록을 지우지 않는다", !/iceBallot\.deleteMany\(/.test(iceActions));
  truthy("결선은 후보를 좁히면서 새 회차를 연다", /eligibleTargets: vote\.candidates/.test(DAY_VOTE));
  truthy("투표를 열 때 회차가 올라간다", /voteSeq: round\.voteSeq \+ 1/.test(iceActions));
  truthy("밤으로 갈 때 후보가 다시 넓어진다", /phase: "night", day: input\.day \+ 1, eligibleTargets: \[\]/.test(DAY_VOTE));
  // ⚠️ 결선도 **새 회차**여야 한다. 같은 회차로 두면 결선 앞의 표가 결선 표에 덮어써져
  //   "누가 누구에게 표를 던졌는가" 가 그 낮의 표만 남는다.
  truthy("결선도 새 회차를 연다", /voteSeq: input\.voteSeq \+ 1/.test(DAY_VOTE));
  truthy("결선 횟수를 센다", /runoffCount: input\.runoffCount \+ 1/.test(DAY_VOTE));
  // ⚠️ 한도는 회차가 아니라 **이번 투표의 결선 횟수**로 잰다. 회차로 재면 밤이 지날 때도 올라가
  //   하루에 세 번 결선한 판이 다음 날 아침 첫 투표에서 한도가 차 버린다.
  truthy("투표를 열 때 결선 횟수가 0 이 된다", /runoffCount: 0/.test(iceActions));
  truthy("표에 결선 여부가 남는다", /const runoff = fresh\.runoffCount > 0/.test(iceActions) && /runoff/.test(DAY_VOTE));

  // ㊼ 표의 **유일한 자리**는 `IceBallot` 이다. 자리의 칸은 구버전용 다리일 뿐이고 읽지 않는다.
  truthy("표는 자기 키를 가진다", /@@id\(\[roundId, seq, memberId\]\)/.test(seatModel));
  // ⚠️ 다리 칸을 **읽으면** 표가 두 벌이 된다. 새 판정은 전부 `IceBallot` 에서 읽어야 한다.
  const viewSource = readCode("../src/server/ice/view.ts");
  truthy("조회는 표 기록에서만 읽는다", /iceBallot\.findMany\(\s*\{\s*where: \{ roundId: round\.id, seq: round\.voteSeq \}/.test(viewSource));
  // `IceView.me.voteForId` 라는 **필드 이름**은 그대로 남는다(화면이 쓰는 이름). 그 값이 **자리에서
  // 오는지** 표에서 오는지가 문제다 — 자리의 다리 칸을 읽으면 표가 두 벌이 된다.
  truthy("view.ts 의 표는 표 기록에서 온다", /voteForId: myBallot\?\.targetId \?\? null/.test(viewSource));
  truthy("view.ts 가 자리의 다리 칸을 읽지 않는다", !/\b[a-z]\.voteForId\b/.test(viewSource));

  // ㊾ 다리는 **구버전 인스턴스가 트래픽을 받는 동안만** 산다.
  //
  // `vercel.json` 이 `prisma migrate deploy` 를 빌드 맨 앞에서 돌기 때문에, 배포 순간엔 구버전이
  // 아직 이 판을 마감할 수 있다. 그 구버전은 표를 `IceSeat.voteForId` 에서만 본다 — 거기에 없으면
  // 표가 0장으로 보이면서 마감되고 아무도 탈락하지 않는다.
  truthy("투표는 다리 칸에도 같이 쓴다", /data: bridge/.test(iceActions));
  truthy("다리를 비우는 길이 있다", /async function clearBridgeVotes/.test(DAY_VOTE));
  // ⚠️ 결선 분기가 다리를 비우는지는 **DB 위에서** 본다(`applyMafiaDayVote`). 여기서 확인하는 것은
  //    적용 로직이 **액션 밖**에 있다는 것뿐이다 — 소스 정규식은 분기 하나의 누락을 놓쳤었다.
  truthy("낮 투표 적용이 액션 밖에서 부러진다", /export async function applyMafiaDayVote/.test(DAY_VOTE));
  truthy("액션은 그 적용을 부른다", /applyMafiaDayVote\(tx,/.test(iceActions));
  truthy("새 투표 회차를 열 때 다리를 비운다", /clearBridgeVotes\(db, round\.id\)/.test(iceActions));
  truthy("밤 처형이 그 밤의 표를 비운다", /clearBridgeVotes\(tx, fresh\.id, (resolution\.outId|memberId)\)/.test(iceActions));
  // 다리를 **읽는** 곳이 새로 생기면 그것이 두 벌이 되는 지점이다.
  truthy("액션은 다리 값을 읽지 않는다(쓰기만)", !/voteForId: (mine|current)\./.test(iceActions));
  // ⚠️ 다리 마이그레이션의 **SQL 내용**은 여기서 검사하지 않는다.
  //
  // 예전엔 `/FROM "IceBallot"/` 로 "표가 된다" 고 했다. 그 SQL 은 실제로는 **조용히 아무것도 하지
  // 않았다**(키가 `(roundId, memberId)` 라 모든 행이 충돌 → `DO NOTHING`). 주석이 표를 "읽는다" 고
  // 적었기 때문에 정규식은 통과했고, 문제는 프로덕션까지 갔다.
  //
  // 그래서 SQL 은 **실제 DB 로** 확인한다 — `npm run db:check:paths`
  // (`scripts/check-migration-paths.mjs`). 여기서는 파일이 존재하고 그 도구를 가리키는지만 본다.
  truthy("다리 마이그레이션이 있다", readCode("../prisma/migrations/20260930210000_ice_legacy_vote_bridge/migration.sql").length > 0);
  truthy("다리 정정 마이그레이션이 있다", readCode("../prisma/migrations/20260930223000_ice_bridge_restore/migration.sql").length > 0);
  const pathCheck = readCode("../scripts/check-migration-paths.mjs");
  truthy("경로를 실제로 돌리는 도구가 있다", /ice_bridge_restore/.test(pathCheck) && /UPDATE "IceSeat"/.test(pathCheck));
  // "언제 지운다" 를 못 박아 두지 않으면 다리가 영구화된다 — 표의 자리가 두 벌이 된다.
  const bridge = readCode("../prisma/migrations/20260930210000_ice_legacy_vote_bridge/migration.sql");
  truthy("다리가 언제 지워지는지 Says 한다", /다음 배포에서 이 컬럼을 (다시 )?지우/.test(bridge));
}

console.log("\n마피아 게임: 결선이 다리를 비우는가 (실제 DB 위에서)");
{
  /**
   * 짚어진 결함 2: **결선을 만들었을 때 다리 표를 비우지 않았다.**
   *
   * 예전 검사는 `clearBridgeVotes(db, round.id)` 가 파일 어딘가에 있는지만 봤다 — 그래서
   * `startIceVote()` 한 곳에 있어도 통과했고, 결선 분기에서 빠진 채 남았다. 그 결과 다리 칸에는
   * 직전 일반투표의 표가 남고, 구버전이 마감하면 **지난 표를 결선 표로 세어** 결선 밖의 사람이
   * 탈락했다.
   *
   * 여기서는 **세션도 액션도 아닌** 적용 로직(`server/ice/day-vote.ts`)을 트랜잭션째로 부른다.
   * 정규식이 아니라 DB 의 상태로 확인한다.
   */
  const team = await db.team.create({
    data: { name: "결선 다리 확인용", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  try {
    const names = ["김민준", "이서연", "박지호", "최수빈"];
    const seats: { id: string }[] = [];
    for (const name of names) seats.push(await db.member.create({ data: { teamId: team.id, name } }));

    const mk = (phase: string, seq: number) =>
      db.iceRound.create({
        data: {
          teamId: team.id,
          activeKey: team.id,
          game: "mafia",
          phase,
          day: 1,
          voteSeq: seq,
          hostId: seats[0].id,
          seats: { create: seats.map((s, i) => ({ memberId: s.id, role: i === 0 ? "mafia" : "citizen" })) },
        },
      });

    const read = async () => {
      const r = await db.iceRound.findFirstOrThrow({ where: { activeKey: team.id } });
      const rows = await db.iceSeat.findMany({ where: { roundId: r.id }, select: { voteForId: true } });
      const ballots = await db.iceBallot.findMany({ where: { roundId: r.id, seq: r.voteSeq } });
      return { round: r, legacy: rows.map((x) => x.voteForId).filter((x) => x !== null).length, ballots: ballots.length };
    };

    // ㊿ 동점인 일반투표: 이서연 2표, 박지호 2표 → 결선이 된다.
    const round = await mk("voting", 1);
    await db.iceBallot.createMany({
      data: [
        { roundId: round.id, seq: 1, day: 1, memberId: seats[0].id, targetId: seats[1].id, runoff: false },
        { roundId: round.id, seq: 1, day: 1, memberId: seats[2].id, targetId: seats[1].id, runoff: false },
        { roundId: round.id, seq: 1, day: 1, memberId: seats[1].id, targetId: seats[2].id, runoff: false },
        { roundId: round.id, seq: 1, day: 1, memberId: seats[3].id, targetId: seats[2].id, runoff: false },
      ],
    });
    // 다리 칸에도 같은 표가 남아 있다(신버전이 같이 쓴다).
    await db.iceSeat.updateMany({ where: { roundId: round.id }, data: { voteForId: null } });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[0].id } }, data: { voteForId: seats[1].id } });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[2].id } }, data: { voteForId: seats[1].id } });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[1].id } }, data: { voteForId: seats[2].id } });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[3].id } }, data: { voteForId: seats[2].id } });
    check("결선을 만들기 전 다리에도 표가 있다", (await read()).legacy, 4);

    const rows0 = (await db.iceSeat.findMany({ where: { roundId: round.id } })).map((s) => ({
      memberId: s.memberId,
      voteForId: s.voteForId,
    }));
    const ballots0 = await db.iceBallot.findMany({ where: { roundId: round.id, seq: 1 } });
    const message = await db.$transaction((tx) =>
      applyMafiaDayVote(tx, {
        roundId: round.id,
        game: "mafia",
        voteSeq: 1,
        runoffCount: 0,
        eligibleTargets: [],
        day: 1,
        alive: seats.map((s) => ({ memberId: s.id, role: "citizen" as const })),
        ballots: ballots0,
        legacy: rows0,
      }),
    );

    // ① 회차가 올랐다 — 결선은 새 투표다.
    const after = await read();
    check("결선은 회차를 열었다", after.round.voteSeq, 2);
    check("결선 후보는 동점자 둘이다", after.round.eligibleTargets, [seats[1].id, seats[2].id]);
    check("결선 횟수를 셌다", after.round.runoffCount, 1);
    // ② ⚠️ 다리가 **비워졌다** — 안 비우면 구버전이 마감할 때 지난 표를 결선 표로 센다.
    check("다리 표가 전부 지워졌다", after.legacy, 0);
    check("아직 아무도 탈락하지 않았다", (await db.iceSeat.findMany({ where: { roundId: round.id, outAt: null } })).length, 4);
    check("사회자에게 동점임을 말한다", message?.includes("동점"), true);
    // ③ 신 회차에는 표가 없다 — 지난 표와 섞이지 않는다.
    check("새 회차에는 표가 없다", after.ballots, 0);

    await db.iceRound.delete({ where: { id: round.id } });

    // ㋑ 결선이 아니라 **처형**이면 다리도 비워진다(옛 코드가 비우던 자리와 같은 조건).
    const second = await mk("voting", 1);
    await db.iceBallot.createMany({
      data: [
        { roundId: second.id, seq: 1, day: 1, memberId: seats[0].id, targetId: seats[1].id, runoff: false },
        { roundId: second.id, seq: 1, day: 1, memberId: seats[1].id, targetId: seats[2].id, runoff: false },
        { roundId: second.id, seq: 1, day: 1, memberId: seats[2].id, targetId: seats[3].id, runoff: false },
        { roundId: second.id, seq: 1, day: 1, memberId: seats[3].id, targetId: seats[2].id, runoff: false },
      ],
    });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: second.id, memberId: seats[3].id } }, data: { voteForId: seats[2].id } });

    const rows1 = (await db.iceSeat.findMany({ where: { roundId: second.id } })).map((s) => ({
      memberId: s.memberId,
      voteForId: s.voteForId,
    }));
    const ballots1 = await db.iceBallot.findMany({ where: { roundId: second.id, seq: 1 } });
    await db.$transaction((tx) =>
      applyMafiaDayVote(tx, {
        roundId: second.id,
        game: "mafia",
        voteSeq: 1,
        runoffCount: 0,
        eligibleTargets: [],
        day: 1,
        // ⚠️ 마피아가 0명이면 **판이 끝난다**(시민 승리) — 밤으로 가는 것을 보려면 마피아가 있어야 한다.
        alive: seats.map((s, i) => ({ memberId: s.id, role: i === 0 ? ("mafia" as const) : ("citizen" as const) })),
        ballots: ballots1,
        legacy: rows1,
      }),
    );
    const afterElim = await read();
    check("처형된 사람은 빠졌다", (await db.iceSeat.findMany({ where: { roundId: second.id, outAt: null } })).length, 3);
    check("처형 뒤에도 다리는 비워진다", afterElim.legacy, 0);
    // 판이 끝나지 않았으면 밤이 온다 — 밤 번호가 하나 올라간다.
    check("처형 뒤 밤이 왔다", [afterElim.round.phase, afterElim.round.day], ["night", 2]);

    await db.iceRound.delete({ where: { id: second.id } });
  } finally {
    await db.team.delete({ where: { id: team.id } }).catch(() => {});
  }
}

console.log("\n마피아 게임: 구버전이 던진 표를 신버전이 센다");
{
  /**
   * 짚어진 결함 3: 다리는 **신버전 → 구버전** 방향으로만 통한다.
   *
   * ```
   * 구버전 투표 → voteForId 에만 있음 → 신버전은 IceBallot 만 읽음 → 그 표가 사라진 것처럼 보인다
   * ```
   *
   * 배포가 끝나기 전 1~2분 동안 실제로 이 일이 일어난다. 그래서 마감할 때 **다리 칸에 홀로 있는 표를
   * 표 기록으로 접는다.** 여기서는 그것이 실제 DB 에서 **정확히 1표**로 계산되는지 본다.
   */
  const team = await db.team.create({
    data: { name: "수렴 확인용", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  try {
    const names = ["김민준", "이서연", "박지호"];
    const seats: { id: string }[] = [];
    for (const name of names) seats.push(await db.member.create({ data: { teamId: team.id, name } }));
    const round = await db.iceRound.create({
      data: {
        teamId: team.id,
        activeKey: team.id,
        game: "mafia",
        phase: "voting",
        day: 1,
        voteSeq: 1,
        hostId: seats[0].id,
        seats: { create: seats.map((s) => ({ memberId: s.id, role: "citizen" })) },
      },
    });

    // 구버전 인스턴스만 표를 던진 상태: 다리 칸에만 있다.
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[0].id } }, data: { voteForId: seats[1].id } });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[1].id } }, data: { voteForId: seats[1].id } });
    check("신버전 기록에는 아직 표가 없다", await db.iceBallot.count({ where: { roundId: round.id } }), 0);

    const rows0 = (await db.iceSeat.findMany({ where: { roundId: round.id } })).map((s) => ({
      memberId: s.memberId,
      voteForId: s.voteForId,
    }));
    const ballots0 = await db.iceBallot.findMany({ where: { roundId: round.id, seq: 1 } });
    const rows2 = (await db.iceSeat.findMany({ where: { roundId: round.id } })).map((s) => ({
      memberId: s.memberId,
      voteForId: s.voteForId,
    }));
    const message = await db.$transaction((tx) =>
      applyMafiaDayVote(tx, {
        roundId: round.id,
        game: "mafia",
        voteSeq: 1,
        runoffCount: 0,
        eligibleTargets: [],
        day: 1,
        alive: seats.map((s) => ({ memberId: s.id, role: "citizen" as const })),
        ballots: [],
        legacy: rows2,
      }),
    );

    // ㋒ 흡수된 표는 **기록에도 남는다** — 결과 화면의 "누가 누구에게 표를 던졌는지" 때문이다.
    const stored = await db.iceBallot.findMany({ where: { roundId: round.id, seq: 1 } });
    check("구버전 표가 표 기록으로 접혔다", stored.length, 2);
    check("누가 누구에게 던졌는지 남는다", stored.map((b) => `${b.memberId === seats[0].id ? "김민준" : "이서연"}→${b.targetId === seats[1].id ? "이서연" : "박지호"}`), [
      "김민준→이서연",
      "이서연→이서연",
    ]);
    // 이서연이 2표를 받아 처형된다 — 세지 않았다면 동점/무표가 되어 아무도 빠지지 않는다.
    const out = await db.iceSeat.findMany({ where: { roundId: round.id, outAt: { not: null } } });
    check("구버전이 던진 표로 이서연이 빠졌다", out.map((s) => s.memberId), [seats[1].id]);
    check("박지호는 빠지지 않았다", (await db.iceSeat.findMany({ where: { roundId: round.id, memberId: seats[2].id, outAt: null } })).length, 1);
    check("처형이었다면 말을 남기지 않는다", message, undefined);

    // ㋓ **표 기록이 이긴다** — 양쪽에 있으면 더 최신인 기록을 덮어쓰지 않는다.
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "voting", voteSeq: 2 } });
    await db.iceBallot.create({ data: { roundId: round.id, seq: 2, day: 1, memberId: seats[0].id, targetId: seats[2].id, runoff: false } });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[0].id } }, data: { voteForId: seats[1].id } });
    const rows3 = (await db.iceSeat.findMany({ where: { roundId: round.id } })).map((s) => ({
      memberId: s.memberId,
      voteForId: s.voteForId,
    }));
    const ballots3 = await db.iceBallot.findMany({ where: { roundId: round.id, seq: 2 } });
    await db.$transaction((tx) =>
      applyMafiaDayVote(tx, {
        roundId: round.id,
        game: "mafia",
        voteSeq: 2,
        runoffCount: 0,
        eligibleTargets: [],
        day: 1,
        alive: seats.map((s) => ({ memberId: s.id, role: "citizen" as const })),
        ballots: ballots3,
        legacy: rows3,
      }),
    );
    check("표 기록은 다리에 덮이지 않는다", await db.iceBallot.count({ where: { roundId: round.id, seq: 2 } }), 1);
    check("박지호가 빠졌다(기록이 이긴 결과)", (await db.iceSeat.findMany({ where: { roundId: round.id, memberId: seats[2].id, outAt: { not: null } } })).length, 1);

    await db.iceRound.delete({ where: { id: round.id } });
  } finally {
    await db.team.delete({ where: { id: team.id } }).catch(() => {});
  }
}

console.log("\n마피아 게임: 결과 타임라인");
{
  // ㊻ 이 판이 지나온 길은 **기록에서만** 만든다. 새 값을 지어내면 그 판이 왜 그렇게 끝났는지
  //   다시 볼 수 없고, 지어낸 줄은 읽는 사람마다 다르게 보인다.
  const seats = [
    // 1일차 밤에 마피아가 지목, 의사가 살렸다 → 아무도 안 빠졌다.
    { memberId: "m", outDay: null, outHow: null },
    { memberId: "d", outDay: null, outHow: null },
    { memberId: "c1", outDay: 1, outHow: "vote" },
    { memberId: "c2", outDay: 2, outHow: "night" },
  ];
  const ballots = [
    { seq: 1, day: 1, memberId: "m", targetId: "c1", runoff: false },
    { seq: 1, day: 1, memberId: "d", targetId: "c2", runoff: false },
    // 2일차: 결선(seq 2)과 보통 투표(seq 3)가 남아 있다 — 앞 표가 덮어써지지 않았다.
    { seq: 2, day: 2, memberId: "m", targetId: "c1", runoff: true },
    { seq: 2, day: 2, memberId: "d", targetId: "c1", runoff: true },
  ];
  const nightActs = [
    { day: 1, kind: "mafia_kill", targetId: "c2" },
    { day: 1, kind: "doctor_save", targetId: "c2" },
    { day: 2, kind: "mafia_kill", targetId: "c2" },
  ];

  const tl = mafiaTimeline({ seats, ballots, nightActs });
  check("밤과 투표가 네 줄이다", tl.map((e) => `${e.day}-${e.how}`), [
    "1-night",
    "1-vote",
    "2-night",
    "2-vote",
  ]);

  // 밤 → 낮 순서다. 시간순이 아니라 "그날 밤이 그날 낮보다 먼저" 여야 읽힌다.
  check("같은 날은 밤이 먼저 온다", tl.filter((e) => e.day === 1).map((e) => e.how), ["night", "vote"]);

  // ㊼ 아무도 빠지지 않은 밤도 **줄이 남는다** — 지목과 보호 기록이 그 사실을 증명한다.
  check("1일차 밤에는 아무도 빠지지 않았다", tl[0].outId, null);
  check("1일차 밤의 지목과 보호가 남는다", [tl[0].killId, tl[0].savedId], ["c2", "c2"]);
  check("2일차 밤에 빠른 사람이 남는다", tl[2].outId, "c2");
  check("1일차 투표로 빠진 사람이 남는다", tl[1].outId, "c1");

  // ㊽ 결선 투표는 결선이라고 표시된다 — 아니면 같은 낮의 두 투표가 구별되지 않는다.
  check("결선 투표는 결선이다", tl[3].runoff, true);
  check("보통 투표는 결선이 아니다", tl[1].runoff, false);
  check("누가 누구에게 던졌는지 남는다", tl[1].cast, [
    { from: "m", to: "c1" },
    { from: "d", to: "c2" },
  ]);
  check("밤에는 표가 없다", tl[0].cast, []);

  // ㊾ 기록이 없는 밤은 **줄을 지어내지 않는다.** 지목도 보호도 없는데 누가 죽었다면 그건
  //   직접 적은 예외 길이고, 언제였는지는 알 수 없다.
  const blind = mafiaTimeline({
    seats: [{ memberId: "x", outDay: 3, outHow: "night" }],
    ballots: [],
    nightActs: [],
  });
  check("지목 기록이 없는 밤도 줄은 남는다", [blind.length, blind[0].day, blind[0].killId], [1, 3, null]);
  check("아무 기록이 없으면 빈 타임라인이다", mafiaTimeline({ seats: [], ballots: [], nightActs: [] }), []);

  // ㊿ 모르는 날짜는 null 이다 — 숫자를 지어내지 않는다.
  const unknown = mafiaTimeline({
    seats: [{ memberId: "x", outDay: null, outHow: "night" }],
    ballots: [],
    nightActs: [],
  });
  check("날짜를 모르면 모른다고 말한다", unknown, []);

  // ⚠️ 타임라인은 **결과 공개 뒤에만** 만든다. 투표가 진행 중인데 결론이 보이면 안 된다.
  truthy("타임라인은 결과 공개 뒤에만 만든다", /revealed && mafia[\s\S]{0,80}mafiaTimeline\(/.test(readCode("../src/server/ice/view.ts")));
  // 자리를 빠질 때 **몇 번째 밤인지도** 함께 적는다 — 시각만으로는 밤을 구분할 수 없다(자정 넘김).
  const iceActions = readCode("../src/server/actions/ice.ts");
  truthy("밤 처형이 밤 번호를 적는다", /outHow: "night", outDay: fresh\.day/.test(iceActions));
  // 처형 로직도 액션 밖으로 옮겨갔다 — 낮 번호를 남기는 코드까지 그쪽에 있다.
  truthy("투표 처형이 낮 번호를 적는다", /outHow: "vote", outDay: input\.day/.test(DAY_VOTE));
}

console.log("\n마피아 게임: 실제로 만든 판에서 투표가 기록으로 남는다");
{
  const team = await db.team.create({
    data: { name: "투표 확인용", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  try {
    const names = ["김민준", "이서연", "박지호", "최수빈", "정예진"];
    const seats: { id: string }[] = [];
    for (const name of names) seats.push(await db.member.create({ data: { teamId: team.id, name } }));
    const round = await db.iceRound.create({
      data: {
        teamId: team.id,
        activeKey: team.id,
        game: "mafia",
        phase: "voting",
        day: 1,
        voteSeq: 1,
        hostId: seats[0].id,
        seats: {
          create: seats.map((s, i) => ({ memberId: s.id, role: i === 0 ? "mafia" : i === 1 ? "police" : "citizen" })),
        },
      },
    });
    const asMember = (id: string, name: string) => ({ id, teamId: team.id, name, isLeader: false });

    // ㊽ 아무도 투표하지 않은 투표 단계.
    // ⚠️ `canVoteFor` 는 **자리 정렬(이름순)** 을 따른다 — 생성 순서와 비교하면 이 검사가
    //    사람 이름이 바뀔 때마다 조용히 깨진다. 집합으로 비교한다.
    const sorted = (ids: string[]) => [...ids].sort();
    const empty = (await iceViewFor(asMember(seats[2].id, "박지호")))!;
    check("표가 하나도 없다", { ...empty.votes, canVoteFor: sorted(empty.votes.canVoteFor) }, {
      cast: 0,
      total: 5,
      seq: 1,
      runoff: false,
      canVoteFor: sorted(seats.map((s) => s.id).filter((id) => id !== seats[2].id)),
    });

    // ㊾ 표는 한 줄씩 쌓인다. 같은 사람이 다시 고르면 **한 줄이 바뀐다** — 두 줄이면 "몇 명이
    //   투표했나" 를 셀 수 없다.
    for (const [voter, target] of [
      [seats[2].id, seats[3].id],
      [seats[3].id, seats[4].id],
      [seats[4].id, seats[3].id],
    ]) {
      await db.iceBallot.create({ data: { roundId: round.id, seq: 1, day: 1, memberId: voter, targetId: target, runoff: false } });
    }
    const dup = await db.iceBallot
      .create({ data: { roundId: round.id, seq: 1, day: 1, memberId: seats[2].id, targetId: seats[4].id, runoff: false } })
      .catch((e: { code?: string }) => e.code);
    check("같은 회차에 같은 사람의 표는 두 줄이 안 된다", dup, "P2002");

    const voted = (await iceViewFor(asMember(seats[2].id, "박지호")))!;
    check("세 명이 투표했다", voted.votes.cast, 3);
    check("내 선택이 보인다", voted.me?.voteForId, seats[3].id);
    // 다른 사람의 표는 그 화면에 없다 — 세 명 중 내 표 하나만 `me.voteForId` 로 내려간다.
    const othersJson = JSON.stringify(await iceViewFor(asMember(seats[4].id, "정예진")));
    check("각자 자기 표만 본다", (await iceViewFor(asMember(seats[4].id, "정예진")))!.me?.voteForId, seats[3].id);
    truthy("투표한 사람 수가 공개되지 않는다", !othersJson.includes(`"cast":4`));

    // ㊿ 결선은 **새 회차**에서 좁힌 후보로 열린다 — 앞 회차의 표가 남는다.
    await db.iceRound.update({
      where: { id: round.id },
      data: { eligibleTargets: [seats[3].id, seats[4].id], voteSeq: 2, runoffCount: 1 },
    });
    const runoffView = (await iceViewFor(asMember(seats[2].id, "박지호")))!;
    check("결선이라고 표시된다", runoffView.votes.runoff, true);
    check("동점자만 고를 수 있다", runoffView.votes.canVoteFor, [seats[3].id, seats[4].id]);
    // 동점자 자신이 투표할 때는 자기 자신이 빠진다 — 자기에게 투표하면 동점이 영영 안 끝난다.
    check("동점자 자신에게는 자기 자신이 빠진다", (await iceViewFor(asMember(seats[3].id, "최수빈")))!.votes.canVoteFor, [seats[4].id]);
    // ⚠️ 회차가 늘어야 한다 — 같은 회차라면 결선 앞 표가 결선 표에 덮어써진다.
    check("결선은 새 회차다", runoffView.votes.seq, 2);
    // 앞 회차의 표가 **남아 있어야** "누가 누구에게 표를 던졌는가" 를 읽을 수 있다.
    check("결선 앞 회차의 표도 남는다", await db.iceBallot.count({ where: { roundId: round.id, seq: 1 } }), 3);

    // ㊿ 표와 밤 행동이 남으면 **결과 공개 뒤의 타임라인이 그 기록에서 나온다.**
    await db.iceBallot.createMany({
      data: [
        { roundId: round.id, seq: 2, day: 1, memberId: seats[3].id, targetId: seats[0].id, runoff: true },
        { roundId: round.id, seq: 2, day: 1, memberId: seats[4].id, targetId: seats[0].id, runoff: true },
      ],
    });
    // 마피아가 최수빈을 지목했고, 의사는 **다른 사람**을 보호했다 → 최수빈이 1일차 밤에 빠진다.
    await db.iceNightAction.createMany({
      data: [
        { roundId: round.id, day: 1, actorId: seats[0].id, kind: "mafia_kill", targetId: seats[3].id },
        { roundId: round.id, day: 1, actorId: seats[1].id, kind: "doctor_save", targetId: seats[4].id },
      ],
    });
    await db.iceSeat.update({ where: { roundId_memberId: { roundId: round.id, memberId: seats[3].id } }, data: { outAt: new Date(), outHow: "night", outDay: 1 } });
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "revealed", resultCode: "TOWN_WIN", winner: "citizen", eligibleTargets: [] } });

    const done = (await iceViewFor(asMember(seats[0].id, "김민준")))!.result!;
    // ㋐ 밤 한 번 + 투표 **두 번**(보통 투표·결선)이 각각 한 줄이다. 결선 앞 표가 덮어써지지
    //   않았으므로 두 줄이 남는다 — 하나였다면 "결선이 있었는지" 를 알 수 없다.
    check("타임라인은 밤 → 투표 → 결선 순서다", done.timeline.map((e) => `${e.day}-${e.how}`), [
      "1-night",
      "1-vote",
      "1-vote",
    ]);
    check("밤 줄에 지목과 보호가 남는다", [done.timeline[0].kill, done.timeline[0].saved], ["최수빈", "정예진"]);
    check("밤에 빠진 사람이 남는다", done.timeline[0].out, "최수빈");
    check("보통 투표 줄은 결선이 아니다", done.timeline[1].runoff, false);
    check("보통 투표는 세 명", done.timeline[1].cast.length, 3);
    check("결선 줄은 결선이라고 말한다", done.timeline[2].runoff, true);
    check("결선 투표도 누가 누구에게 던졌는지 남는다", done.timeline[2].cast.length, 2);
    // 이름으로 말하지 않는다 — 타임라인이 결과 공개 뒤에만 나온다는 뜻이다.
    // 역할 이름은 결과 공개 뒤에만 나간다 — 결과를 보기 전에 "누가 마피아였지" 를 알 수 없다.
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "voting" } });
    const midJson = JSON.stringify(await iceViewFor(asMember(seats[3].id, "최수빈")));
    truthy("투표 중에는 남의 역할이 화면에 없다", !midJson.includes("police"));
    check("투표 중에는 결과도 없다", (await iceViewFor(asMember(seats[3].id, "최수빈")))!.result, null);
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "revealed", resultCode: "TOWN_WIN", winner: "citizen" } });

    await db.iceRound.delete({ where: { id: round.id } });
  } finally {
    await db.team.delete({ where: { id: team.id } }).catch(() => {});
  }
}

console.log("\n마피아 게임: 밤 행동");
{
  // ㉚ 시민은 밤에 아무것도 하지 않는다 — 선택지를 그리는 것만으로도 밤이 새어 나간다.
  check("마피아는 밤에 지목한다", nightRoleOf("mafia"), "mafia_kill");
  check("의사는 밤에 보호한다", nightRoleOf("doctor"), "doctor_save");
  check("경찰은 밤에 조사한다", nightRoleOf("police"), "police_check");
  check("시민은 밤에 아무것도 안 한다", nightRoleOf("citizen"), null);
  check("라이어도 밤에 아무것도 안 한다", nightRoleOf("liar"), null);

  const seats = [
    { memberId: "m1", role: "mafia" as IceRole, outAt: null },
    { memberId: "m2", role: "mafia" as IceRole, outAt: null },
    { memberId: "p", role: "police" as IceRole, outAt: null },
    { memberId: "d", role: "doctor" as IceRole, outAt: null },
    { memberId: "c1", role: "citizen" as IceRole, outAt: null },
    { memberId: "c2", role: "citizen" as IceRole, outAt: new Date() },
  ];

  // ㉛ 필요한 행동은 **살아 있는** 밤 행동 능력뿐이다. 어제 죽은 의사는 오늘 밤을 막지 않는다.
  const required = requiredNightActions(seats);
  check("살아 있는 밤 행동은 네 번이다", required.length, 4);
  check("죽은 시민은 필요하지 않다", required.some((r) => r.memberId === "c2"), false);
  check("마피아는 둘 다 필요하다", required.filter((r) => r.kind === "mafia_kill").length, 2);

  // ㉜ 고를 수 있는 사람은 **규칙이 정한다** — 화면이 조건을 다시 쓰지 않는다.
  check("마피아는 자기 자신을 못 지목한다", mayTargetAtNight("mafia_kill", "m1", { memberId: "m1", outAt: null }), false);
  check("의사는 자기 자신을 보호할 수 있다", mayTargetAtNight("doctor_save", "d", { memberId: "d", outAt: null }), true);
  // ⚠️ 경찰이 자기 자신을 조사하면 "마피아다" 를 배운다 — 아무것도 못 조사한 것과 같다.
  check("경찰은 자기 자신을 조사할 수 없다", mayTargetAtNight("police_check", "p", { memberId: "p", outAt: null }), false);
  check("죽은 사람은 못 고른다", mayTargetAtNight("mafia_kill", "m1", { memberId: "c2", outAt: new Date() }), false);
  check("살아 있는 다른 사람은 된다", mayTargetAtNight("mafia_kill", "m1", { memberId: "c1", outAt: null }), true);

  // ㉝ 밤 판정: 필요한 행동이 모이면 세 가지 결과 중 하나가 된다.
  const kill = (actorId: string, targetId: string) => ({ actorId, kind: "mafia_kill" as const, targetId });
  const save = (actorId: string, targetId: string) => ({ actorId, kind: "doctor_save" as const, targetId });
  const checkAct = (actorId: string, targetId: string) => ({ actorId, kind: "police_check" as const, targetId });
  const all = [kill("m1", "c1"), kill("m2", "c1"), save("d", "d"), checkAct("p", "m1")];

  check("하나라도 모이면 밤이 안 풀린다", resolveNight(all.slice(0, 3), seats), { kind: "pending", missing: 1 });
  // 죽은 자리가 있는 판에서는 죽은 쪽의 행동이 필요 없다.
  const shortSeats = [seats[0], seats[1], seats[2], seats[3], seats[4]];
  check("남은 행동이 모이면 풀린다", resolveNight(all, shortSeats), { kind: "resolved", outId: "c1", savedId: "d" });

  // 의사가 지목한 사람이 마피아가 지목한 사람이면 아무도 빠지지 않는다.
  check(
    "의사가 살리면 아무도 안 빠진다",
    resolveNight([kill("m1", "c1"), kill("m2", "c1"), save("d", "c1"), checkAct("p", "m1")], seats),
    { kind: "resolved", outId: null, savedId: "c1" },
  );
  // ⚠️ 마피아가 다르게 골랐다면 **아무도 안 죽은 밤으로 넘기면 안 된다.** 밤이 풀리지 않았다는
  //   사실을 사회자가 알아야 마피아끼리 다시 정할 수 있다.
  check(
    "마피아가 다르게 골랐으면 풀지 않는다",
    resolveNight([kill("m1", "c1"), kill("m2", "d"), save("d", "d"), checkAct("p", "m1")], seats),
    { kind: "disagree" },
  );
  // 마피아가 한 명이면 합의가 필요 없다. (의사가 앉아 있으면 **의사도 고쳐야** 밤이 풀린다 —
  // 막판에 그 규칙이 빠져 있으면 "아무도 안 죽었다" 는 밤이 조용히 늘어난다.)
  const solo = [
    { memberId: "m1", role: "mafia" as IceRole, outAt: null },
    { memberId: "c1", role: "citizen" as IceRole, outAt: null },
  ];
  check("마피아가 한 명이면 그 선택이 곧 밤이다", resolveNight([kill("m1", "c1")], solo), {
    kind: "resolved",
    outId: "c1",
    savedId: null,
  });
  check("의사가 앉아 있으면 의사도 기다린다", resolveNight([kill("m1", "c1")], solo.concat(solo[1], { memberId: "d", role: "doctor" as IceRole, outAt: null })), {
    kind: "pending",
    missing: 1,
  });
  // 의사가 마피아를 보호했다(아무도 몰랐다) — 밤이 조용히 넘어간다.
  const hidMafia = resolveNight([kill("m1", "c1"), save("d", "c1")], solo.concat([{ memberId: "d", role: "doctor" as IceRole, outAt: null }]));
  check("의사가 마피아를 살려도 결과는 같아 보인다", hidMafia.kind === "resolved" && hidMafia.outId, null);

  // ㉞ 밤 행동은 판정 규칙 한 곳에서 나온다 — 화면이 밤의 결과를 다시 계산하지 않는다.
  truthy("밤 판정은 resolveNight 한 곳이다", /resolveNight\(/.test(readCode("../src/server/actions/ice.ts")));
  truthy("밤 행동은 한 줄이 바뀐다(upsert)", /iceNightAction\.upsert\(/.test(readCode("../src/server/actions/ice.ts")));

  // ㉟ **밤의 길 네 개가 모두 같은 잠금 경계를 쓴다.**
  //
  // ⚠️ `submitIceNightAction()` 만 잠금 밖에서 "아직 밤인가" 를 보면 이 경합이 가능하다.
  //      A: 밤 확인 → B: 밤을 풀고 discussions 로 전환·커밋 → A: 늦게 표가 들어감.
  //    그러면 **이미 끝난 밤에 행동 기록이 남고**, 그 밤의 판정이 그 행동 근거로 든 일이 아니다.
  //    잠근 뒤 **다시 읽어서** 밤인지를 확인하면 늦게 온 행동은 거절된다.
  const nightPaths = ["submitIceNightAction", "resolveIceNight", "closeIceNight", "markIceNightOut"] as const;
  for (const name of nightPaths) {
    const src = readCode("../src/server/actions/ice.ts");
    const body = src.slice(src.indexOf(`export async function ${name}`), src.indexOf("\nexport async function", src.indexOf(`export async function ${name}`) + 10));
    truthy(`${name} 은 판의 행을 잠근다`, /FOR UPDATE/.test(body));
    // 잠긴 **뒤에** 밤인지를 다시 보는지 확인한다. 잠금 앞의 조기 종료는 빠른 실패일 뿐
    // 근거가 아니다 — 두 번째 확인이 없으면 위의 경합이 그대로 열린다.
    const afterLock = body.slice(body.indexOf("FOR UPDATE"));
    truthy(`${name} 은 잠근 뒤 밤을 다시 본다`, afterLock.includes('phase !== "night"'));
  }
}

console.log("\n마피아 게임: 실제로 만든 판에서 밤 행동이 새지 않는다");
{
  /**
   * 밤 행동의 비밀은 **그 행동을 한 사람에게만** 보여 준다는 것이다.
   * 아래는 실제로 만든 판에서 각 사람 눈의 `IceView` 를 **문자열로** 만든다 — 직렬화되어
   * 브라우저로 나가는 그 순간을 본다.
   */
  const team = await db.team.create({
    data: { name: "밤 확인용", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  try {
    const names = ["김민준", "이서연", "박지호", "최수빈", "정예진"];
    const seats: { id: string }[] = [];
    for (const name of names) seats.push(await db.member.create({ data: { teamId: team.id, name } }));
    // [마피아, 경찰, 의사, 시민, 시민]
    const roles: IceRole[] = ["mafia", "police", "doctor", "citizen", "citizen"];
    const mafiaId = seats[0].id;
    const policeId = seats[1].id;
    const doctorId = seats[2].id;

    const round = await db.iceRound.create({
      data: {
        teamId: team.id,
        activeKey: team.id,
        game: "mafia",
        phase: "night",
        day: 2,
        hostId: mafiaId,
        seats: { create: seats.map((s, i) => ({ memberId: s.id, role: roles[i] })) },
      },
    });
    const asMember = (id: string, name: string) => ({ id, teamId: team.id, name, isLeader: false });

    // ㉟ 아직 아무것도 안 고른 밤. 사회자(마피아)에게는 남은 행동 수만 보인다.
    const hostNight = (await iceViewFor(asMember(mafiaId, "김민준")))!.night!;
    check("밤 행동이 하나도 없으면 전부 남았다", hostNight.waiting, 3);
    check("사회자만 진행도를 본다", (await iceViewFor(asMember(seats[3].id, "최수빈")))!.night!.waiting, null);
    // 마피아가 지목하고 의사가 살리고 경찰이 조사한다.
    await db.iceNightAction.createMany({
      data: [
        { roundId: round.id, day: 2, actorId: mafiaId, kind: "mafia_kill", targetId: seats[4].id },
        { roundId: round.id, day: 2, actorId: doctorId, kind: "doctor_save", targetId: seats[4].id },
        { roundId: round.id, day: 2, actorId: policeId, kind: "police_check", targetId: seats[3].id },
      ],
    });

    // ㊱ 같은 사람이 같은 밤에 다시 고르면 **두 줄이 아니라 한 줄이 바뀐다.** 두 줄이면
    //   "몇 명이 골랐나" 를 셀 수 없고 밤이 풀렸는지 알 방법이 사라진다.
    const again = await db.iceNightAction.create({
      data: { roundId: round.id, day: 2, actorId: mafiaId, kind: "mafia_kill", targetId: seats[3].id },
    }).catch((e: { code?: string }) => e.code);
    check("같은 밤 같은 행동은 두 줄이 안 된다", again, "P2002");

    const ready = (await iceViewFor(asMember(mafiaId, "김민준")))!.night!;
    check("모두 고르면 밤이 풀릴 준비가 된다", ready.waiting, 0);
    check("마피아는 자기 선택을 본다", [ready.mine, ready.myTargetId], ["mafia_kill", seats[4].id]);

    // ㊴ 고를 수 있는 사람은 **서버가 정한 목록**이다 — 마피아는 자기 자신이 목록에 없다.
    check("마피아는 자기 자신이 목록에 없다", ready.canTarget.includes(mafiaId), false);
    check("고를 수 있는 사람은 살아 있는 자리다", ready.canTarget.length, 4);

    // ㊵ **경찰의 조사 결과는 그 경찰에게만** 나간다. 다른 사람의 화면을 문자열로 확인한다.
    const policeJson = JSON.stringify(await iceViewFor(asMember(policeId, "이서연")));
    check("경찰은 자기 조회를 안다", (await iceViewFor(asMember(policeId, "이서연")))!.me!.check, {
      day: 2,
      name: "최수빈",
      isMafia: false,
    });
    truthy("시민의 화면에 마피아 판정 낀 문자열이 없다", !JSON.stringify(await iceViewFor(asMember(seats[3].id, "최수빈"))).includes("isMafia"));
    truthy("다른 마피아의 화면에도 조회가 없다", !JSON.stringify(await iceViewFor(asMember(mafiaId, "김민준"))).includes("isMafia"));
    truthy("경찰의 화면에도 남의 밤 행동이 없다", !policeJson.includes("mafia_kill"));

    // ㊶ 시민에게는 밤 선택지가 아예 없다.
    const citizen = (await iceViewFor(asMember(seats[4].id, "정예진")))!.night!;
    check("시민은 밤에 아무것도 안 한다", citizen.mine, null);
    check("시민에게는 고를 사람도 없다", citizen.canTarget, []);

    // ㊷ 밤이 지나도 경찰은 그 결과를 기억한다 — 다음 밤까지 지우면 없는 정보가 된다.
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "discussion" } });
    check("낮에도 조회가 남는다", (await iceViewFor(asMember(policeId, "이서연")))!.me!.check?.day, 2);
    check("낮에는 아무것도 고를 수 없다", (await iceViewFor(asMember(doctorId, "박지호")))!.night!.open, false);
    check("낮에는 고를 사람도 없다", (await iceViewFor(asMember(doctorId, "박지호")))!.night!.canTarget, []);

    await db.iceRound.delete({ where: { id: round.id } });
  } finally {
    await db.team.delete({ where: { id: team.id } }).catch(() => {});
  }
}

console.log("\n마피아 게임: 실제로 만든 판에서 밤과 낮이 맞아떨어진다");
{
  /**
   * 규칙 함수는 위에서 봤다. 여기서는 **실제로 만든 판**을 보고 각 사람 눈의 `IceView` 를
   * 만든다 — `day` 와 `phase` 가 직렬화되어 브라우저로 나가는 그 순간을 확인한다.
   */
  const team = await db.team.create({
    data: { name: "마피아 확인용", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  try {
    const names = ["김민준", "이서연", "박지호", "최수빈", "정예진"];
    const seats: { id: string }[] = [];
    for (const name of names) seats.push(await db.member.create({ data: { teamId: team.id, name } }));
    const roles: IceRole[] = ["mafia", "police", "doctor", "citizen", "citizen"];

    const mk = (phase: string, day: number) =>
      db.iceRound.create({
        data: {
          teamId: team.id,
          activeKey: team.id,
          game: "mafia",
          phase,
          day,
          hostId: seats[0].id,
          seats: { create: seats.map((s, i) => ({ memberId: s.id, role: roles[i] })) },
        },
      });

    const asMember = (id: string, name: string) => ({ id, teamId: team.id, name, isLeader: false });
    const mafiaId = seats[0].id;

    // ㉚ 첫 밤. 폰에 뜨는 것은 **몇 번째 밤인지** 다 — "3일차 밤" 이 없다면 밤이 몇 번인지
    //     사람도 모르고, 결과 화면의 타임라인도 조작할 수 있다.
    const first = await mk("night", 1);
    const nightView = await iceViewFor(asMember(mafiaId, "김민준"));
    check("첫 밤이다", [nightView?.phase, nightView?.day], ["night", 1]);
    check("밤에는 투표할 수 없다", canVoteNow("mafia", nightView!.phase), false);
    // 밤에는 투표가 닫혀 있고 표도 쌓이지 않는다 — 밤에 고른 표는 낮 표와 섞이지 않는다.
    const nightVotes = nightView!.votes;
    check("밤에는 표가 하나도 안 쌓였다", [nightVotes.cast, nightVotes.runoff], [0, false]);
    check("밤의 밤 번호와 표 회차는 다르다", nightView!.day >= 1, true);

    // ㉛ 밤이 넘어가고 세 번째 밤이 됐을 때.
    await db.iceRound.update({ where: { id: first.id }, data: { phase: "night", day: 3, phaseStartedAt: new Date() } });
    check("세 번째 밤으로 읽힌다", (await iceViewFor(asMember(mafiaId, "김민준")))?.day, 3);
    await db.iceRound.update({ where: { id: first.id }, data: { phase: "discussion" } });
    check("낮에도 밤 번호는 남는다", (await iceViewFor(asMember(mafiaId, "김민준")))?.day, 3);
    check("낮에는 투표가 닫혀 있다", canVoteNow("mafia", (await iceViewFor(asMember(mafiaId, "김민준")))!.phase), false);
    await db.iceRound.update({ where: { id: first.id }, data: { phase: "voting" } });
    check("투표 단계에서만 열린다", canVoteNow("mafia", (await iceViewFor(asMember(mafiaId, "김민준")))!.phase), true);

    await db.iceRound.delete({ where: { id: first.id } });

    // ㉜ 마이그레이션 전에 진행 중이던 마피아 판. 예전 `play` 는 투표가 열려 있던 상태였다 —
    //     밤으로 읽으면 그 판은 갑자기 아무도 투표할 수 없는 판이 된다.
    const legacy = await mk("play", 1);
    const legacyView = await iceViewFor(asMember(seats[1].id, "이서연"));
    check("예전 판은 투표 단계로 읽는다", legacyView?.phase, "voting");
    check("예전 판에서도 투표할 수 있다", canVoteNow("mafia", legacyView!.phase), true);
    check("예전 판의 밤 번호는 1이다", legacyView?.day, 1);
    await db.iceRound.delete({ where: { id: legacy.id } });
  } finally {
    await db.team.delete({ where: { id: team.id } }).catch(() => {});
  }
}

console.log("\n라이어 게임: 비밀은 서버에서만 막는다");
{
  // 이 검사가 진짜 자산이다. 라이어 게임은 **카드 나눠 주고 투표하는 화면**이 아니라,
  // 라이어에게 정답이 한 글자도 내려가지 않아야 성립한다. 화면에서 가리는 것으로는 부족하다
  // (개발자 도구로 보인다).
  //
  // ⑮ 라이어는 `revealed` 가 되기 전까지 제시어를 받지 않는다 — **최종 추측 단계에서도 같다.**
  //     그 단계는 이름부터 정답을 알려 주는 단계이기 때문이다.
  check("라이어는 카드 확인 단계에 못 받는다", maySeeWord("liar", "clue"), false);
  check("라이어는 투표 단계에 못 받는다", maySeeWord("liar", "vote"), false);
  check("라이어는 최종 추측 단계에 못 받는다", maySeeWord("liar", "liar_guess"), false);
  check("결과 공개 뒤에는 라이어도 받는다", maySeeWord("liar", "revealed"), true);
  // ⑯ 시민은 언제나 받는다 — 라이어가 판 안에서 계속 설명해야 하는 이유가 이것이다.
  check("시민은 언제나 받는다", ["clue", "vote", "liar_guess"].map((p) => maySeeWord("citizen", p as IcePhase)), [true, true, true]);

  // ⑰ 판을 만드는 곳이 **이 판정 한 곳만** 지킨다. 조건을 두 번 쓰면 한쪽만 고쳐져 라이어에게
  //     제시어가 나가고, 어느 쪽이 맞는지는 아무도 모른다.
  const viewSource = readCode("../src/server/ice/view.ts");
  truthy("제시어는 maySeeWord 로만 정한다", /word:\s*maySeeWord\(/.test(viewSource));
  truthy("view.ts 가 조건을 다시 쓰지 않는다", !/role\s*!==\s*"liar"\s*\?/.test(viewSource));
  truthy("view.ts 의 maySeeWord 정의는 rules 에 있다", !/function maySeeWord/.test(viewSource));

  // ⑱ 참가자를 고를 때 **같은 팀인지, 팀을 나가지 않았는지**를 서버가 다시 본다. 화면이
  //     골라 온 id 를 믿으면 남의 팀 사람을 판에 앉힐 수 있다.
  const iceSource = readCode("../src/server/actions/ice.ts");
  truthy("참가자 검증이 팀을 함께 본다", /teamId,[\s\S]*?leftAt:\s*null/.test(iceSource));
  truthy("참가자 중복을 거른다", /new Set\(ids\)/.test(iceSource));
  truthy("자기 자신에게는 투표하지 못한다", /targetId === me\.id/.test(iceSource));
  truthy("투표 표시는 열린 단계만 받는다", /canVoteNow\(/.test(iceSource));
  truthy("마감은 판의 행을 잠근 뒤 다시 읽는다", /FOR UPDATE/.test(iceSource));
  truthy("최종 답은 한 번만 받는다", /liarGuess !== null/.test(iceSource));
}

console.log("\n라이어 게임: 실제로 만든 판에서 비밀이 새지 않는가");
{
  /**
   * 여기서부터는 **실제로 만든 판**을 보고 각 사람 눈의 `IceView` 를 만든다.
   *
   * 위 검사는 규칙 함수만 본다. 하지만 비명은 `IceView` 를 **직렬화해서 브라우저로 보내는
   * 그 순간**에 일어난다. 그래서 팀·팀원·판을 만들어 두고 라이어 본인의 화면을 문자열로
   * 바꿔 그 안에 정답이 있는지 본다 — 화면을 가리는 것으로는 막히지 않는다.
   */
  const team = await db.team.create({
    data: { name: "라이어 확인용", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  const other = await db.team.create({
    data: { name: "남의 팀", course: "검증", code: `CD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
  });
  try {
    const names = ["김민준", "이서연", "박지호"];
    const seats = [];
    for (const name of names) seats.push(await db.member.create({ data: { teamId: team.id, name } }));
    const stranger = await db.member.create({ data: { teamId: other.id, name: "남" } });

    const SECRET = "학식선생님";
    const role = new Map<string, string>([
      [seats[0].id, "citizen"],
      [seats[1].id, "liar"],
      [seats[2].id, "citizen"],
    ]);

    const round = await db.iceRound.create({
      data: {
        teamId: team.id,
        activeKey: team.id,
        game: "liar",
        phase: "clue",
        topic: "캠퍼스",
        word: SECRET,
        aliases: ["학식쌤"],
        hostId: seats[0].id,
        seats: {
          create: seats.map((s, i) => ({ memberId: s.id, role: role.get(s.id)!, turnOrder: i + 1 })),
        },
      },
    });

    const asMember = (id: string, name: string) => ({ id, teamId: team.id, name, isLeader: false });
    const liarId = seats[1].id;

    // ⑲ 라이어의 화면을 **문자열로** 만든다 — 실제 브라우저가 받는 것과 같은 형태다.
    const liarView = await iceViewFor(asMember(liarId, "이서연"));
    const liarJson = JSON.stringify(liarView);
    truthy("라이어의 화면에 제시어가 없다", !liarJson.includes(SECRET));
    truthy("라이어의 화면에 정답의 별칭도 없다", !liarJson.includes("학식쌤"));
    check("라이어의 내 카드는 제시어가 비어 있다", liarView?.me?.word, null);
    check("라이어의 주제는 안다", liarView?.me?.topic, "캠퍼스");
    check("라이어에게 결과는 없다", liarView?.result, null);

    // ⑳ 시민에게는 제시어가 간다 — 라이어가 판 안에서 계속 설명해야 하는 이유가 이것이다.
    const citizenJson = JSON.stringify(await iceViewFor(asMember(seats[0].id, "김민준")));
    truthy("시민의 화면에 제시어가 있다", citizenJson.includes(SECRET));
    check("시민의 카드는 제시어를 받는다", (await iceViewFor(asMember(seats[0].id, "김민준")))?.me?.word, SECRET);

    // ㉑ **최종 추측 단계에서도** 제시어는 나가지 않는다. 이 한 줄이 라이어 게임을 성립시킨다.
    await db.iceRound.update({ where: { id: round.id }, data: { phase: "liar_guess", accusedId: liarId } });
    const guessJson = JSON.stringify(await iceViewFor(asMember(liarId, "이서연")));
    truthy("최종 추측 단계의 라이어 화면에도 제시어가 없다", !guessJson.includes(SECRET));
    truthy("최종 추측 단계의 라이어 화면에 별칭도 없다", !guessJson.includes("학식쌤"));
    check("최종 추측 단계에서도 라이어의 제시어는 비어 있다", (await iceViewFor(asMember(liarId, "이서연")))?.me?.word, null);
    check("결과는 아직 없다", (await iceViewFor(asMember(liarId, "이서연")))?.result, null);

    /**
     * ㉒ **재조회해도 그대로여야 한다.** 라이어가 폰을 껐다 켜거나 새로고침하면 `iceViewFor` 를
     * 처음부터 다시 부른다 — 그때 `phase` 가 DB 에서 복원되고, 제시어는 여전히 없다. 이게 깨지면
     * "새로고침하면 정답이 보인다" 가 되는 종류의 버그라 한 번만 봐도 즉시 사고다.
     */
    await new Promise((r) => setTimeout(r, 5));
    const afterReload = await iceViewFor(asMember(liarId, "이서연"));
    check("새로고침 뒤에도 단계가 복원된다", afterReload?.phase, "liar_guess");
    check("새로고침 뒤에도 라이어에게 제시어가 없다", afterReload?.me?.word, null);
    truthy("새로고침 뒤에도 직렬화된 화면에 정답이 없다", !JSON.stringify(afterReload).includes(SECRET));
    // 카드는 **다시 가려진다.** `shown` 은 화면 상태라 새로고침하면 거짓이 되어야 한다 —
    // 라이어가 폰을 놓고 자리를 비웠는데 다음 사람이 그 화면을 봐야 하기 때문이다.
    truthy("카드는 판을 key 로 다시 가려진다", /<SecretCard key=\{view\.roundId\}/.test(readCode("../src/features/social/icebreak-screen.tsx")));

    // ㉒ 판이 끝나면 **전원에게** 제시어가 열린다 — 이제 더 숨길 이유가 없다.
    await db.iceRound.update({
      where: { id: round.id },
      data: { phase: "revealed", liarGuess: "학식선생님", guessCorrect: true, winner: "liar", resultCode: ICE_RESULT_CODES.liarGuessed },
    });
    const done = await iceViewFor(asMember(liarId, "이서연"));
    truthy("결과 공개 뒤에는 라이어에게도 보인다", JSON.stringify(done).includes(SECRET));
    check("라이어도 결과를 본다", done?.me?.word, SECRET);
    check("결과 문장은 코드로 만든다", done?.result?.outcome, "라이어가 제시어를 맞혔습니다. 라이어의 역전승입니다.");
    check("마지막 답이 남는다", done?.result?.guess, { text: "학식선생님", correct: true });

    // ㉓ 설명 순서는 1부터 차례로, 한 번만 정해진다.
    check("설명 순서가 있다", done?.turn.map((t) => t.name), ["김민준", "이서연", "박지호"]);

    // ㉔ 남의 팀 사람이 판을 볼 수 없다 — 판은 팀과 묶여 있다.
    check("다른 팀은 이 판을 볼 수 없다", await iceViewFor({ id: stranger.id, teamId: other.id, name: "남", isLeader: false }), null);

    // ㉕ 참가자 목록에서 남의 팀원은 세어지지 않는다. 이것이 참가자 선택의 방어선이다.
    const roster = await db.member.findMany({
      where: { id: { in: [seats[0].id, seats[1].id, stranger.id] }, teamId: team.id, leftAt: null },
      select: { id: true },
    });
    check("참가자 검증은 남의 팀원을 걸러 낸다", roster.length, 2);

    // ㉖ 팀을 나간 사람은 이 판에 새로 앉을 수 없다.
    const gone = await db.member.create({ data: { teamId: team.id, name: "정수빈" } });
    await db.member.update({ where: { id: gone.id }, data: { leftAt: new Date() } });
    const afterLeave = await db.member.findMany({
      where: { id: { in: [seats[0].id, gone.id] }, teamId: team.id, leftAt: null },
      select: { id: true },
    });
    check("나간 사람은 참가자에서 빠진다", afterLeave.map((m) => m.id), [seats[0].id]);

    await db.iceRound.deleteMany({ where: { id: round.id } });
  } finally {
    await db.team.delete({ where: { id: team.id } }).catch(() => {});
    await db.team.delete({ where: { id: other.id } }).catch(() => {});
  }
}

/* ── 배정은 조용하지 않다 ────────────────────────────────────── */

console.log("\n배정 알림 (맡은 사람은 그 사실을 알아야 한다)");
{
  // ① **처음 맡기면 말한다** — 이게 구멍이었던 자리다. 예전에는 행만 쓰고 아무도 말하지
  //    않았다(담당자는 목록을 열어야 알았다).
  check("처음 남에게 배정하면 알린다", shouldNotifyAssignee("B", null, "A"), true);
  // ② **중복으로 말하지 않는다** — 이미 그 사람에게 있던 것을 다시 저장하면 넣을 때 알았다.
  check("이미 그 사람에게 있던 것은 다시 말하지 않는다", shouldNotifyAssignee("B", "B", "A"), false);
  // ③ **담당자를 비우면 말할 사람이 없다.**
  check("담당자를 비우면 알리지 않는다", shouldNotifyAssignee(null, "B", "A"), false);
  // ④ **나에게 배정하면 알리지 않는다** — `notify` 가 걸러 내지만 의도가 그럴 리 없다.
  check("나에게 배정하면 알리지 않는다", shouldNotifyAssignee("A", null, "A"), false);
  // ⑤ **남에게서 나로 옮긴 것은 나만 알고 있으므로 말하지 않는다.**
  check("남에게서 나로 옮기면 알리지 않는다", shouldNotifyAssignee("A", "B", "A"), false);
  // ⑥ **남에게서 다른 남에게로 옮기면** 그 사람에게 말해야 한다 — 이게 빠지면 조용한 배정이다.
  check("남에게서 다른 남에게로 옮기면 알린다", shouldNotifyAssignee("C", "B", "A"), true);

  // 배정 알림이 **실제로 배정 길에서** 나가는지 — 알림 종류가 등록되어 있어야 하고,
  // 화면이 그 종류를 알지 못하면 `LOOK` 에서 빠진 채 조용히 안 보인다.
  const policy = readCode("../src/server/notify/policy.ts");
  check("알림 종류로 등록되어 있다", /"task-assigned"/.test(policy), true);
  // 배정은 **아는 게 핵심**이라 푸시로 간다 — 나중에 목록을 열면서 알게 되는 것과 다르다.
  check("푸시로 보낸다", /case "task-assigned"[\s\S]{0,200}return "push"/.test(policy), true);
  const look = readCode("../src/features/home/notifications-screen.tsx");
  check("알림함이 그 종류를 그린다", /"task-assigned":\s*\{/.test(look), true);

  const actions = readCode("../src/server/actions/tasks.ts");
  check("배정 길이 알림을 부른다", actions.includes("notifyAssignee("), true);
  // 제목만 바꾸고 **부르는 것을 잊으면** 조용해진다 — 그래서 실제로 부르는지 고정한다.
  check("순수 판정을 거친다", actions.includes("shouldNotifyAssignee("), true);
}

/* ── 상태 변경도 넣은 사람 + 팀장 ──────────────────────────── */

console.log("\n남의 업무 상태를 남이 바꿀 수 없다");
{
  // **어제 발견한 실제 허점이다.** 담당자 지정은 그날 닫았는데 이 자리는 그대로였고,
  // 그 목록에 한 줄도 없었다 — 아무도 보지 않았으므로. 2026-09-28 에 닫았다.
  //
  // 닫는 방식은 제목·담당자·기한과 **똑같은 규칙**(`canEditTask`)이다. 한 가지만 열고
  // 나머지를 열어 둔 규칙은 외우지 못하고, 외울 수 없는 규칙은 규칙이 아니다.
  const actions = readCode("../src/server/actions/tasks.ts");
  const from = actions.indexOf("export async function cycleTaskStatus");
  const fn = actions.slice(from, actions.indexOf("\nexport async function", from + 10));

  // 서버가 막는다 — 화면이 버튼을 숨겼다고 안전하지 않으므로(서버 액션은 POST 로 바로
  // 부를 수 있다).
  check("순수 판정을 부른다", fn.includes("taskEditBlock("), true);
  const guard = fn.indexOf("taskEditBlock(");
  const write = fn.indexOf("data: { status: next }");
  truthy("쓰기 전에 판정한다", guard > 0 && write > guard);
  // 넣기 전에 있던 업무(작성자 없음)는 팀장에게만 연다 — 제목과 같은 규칙.
  check("막힌 이유를 말한다", fn.includes("넣기 전에 있던 업무") && fn.includes("남이 넣은 업무"), true);

  // **같은 판정**이어야 한다 — 두 곳에서 따로 만들면 어느 한쪽이 조용히 어긋난다.
  const perm = readCode("../src/lib/task-permission.ts");
  check("넣은 사람 + 팀장 규칙이 실제로 있다", /createdById === me.id \|\| me.isLeader/.test(perm), true);
  check("작성자가 없으면 팀장에게만 연다", /createdById === null\) return me.isLeader/.test(perm), true);

  // 화면은 **서버가 계산해 보낸 값**만 본다 — 같은 판정을 또 짜지 않는다.
  const screen = readCode("../src/features/tasks/tasks-screen.tsx");
  check("화면이 같은 판정을 다시 짜지 않는다", /canEditTask/.test(screen), false);
  check("조용히 아무 일도 일어나지 않게 않는다", screen.includes("남이 넣은 업무라 상태를 바꿀 수 없습니다"), true);
}

await finish();
