import type { Participation } from "@/features/contrib/participation";
import type { MbtiType } from "./mbti";

/**
 * 도메인 타입.
 *
 * 프로토타입의 `data.js` 는 화면을 그리기 위한 하드코딩 값이었다. 여기서는 그 모양을
 * **실제 API 응답으로 삼을 수 있는 형태**로 다시 정의한다. 서버가 붙을 때 이 타입이
 * 계약(contract)이 되고, `src/data/` 의 목 구현만 교체하면 된다.
 */

/** 역할 식별자 — 드라이브 제출함·기여도 기록이 모두 이 키로 묶인다. */
export type RoleKey = "research" | "deck" | "script" | "present" | "manage";

export type Role = {
  key: RoleKey;
  name: string;
  note: string;
};

export type Team = {
  id: string;
  name: string;
  course: string;
  /** 초대 코드 — 로그인 없이 이 코드 + 이름으로 기록을 잇는다. */
  code: string;
  /**
   * 초대 링크 토큰의 **원문.** 팀을 만들 때만 나온다.
   *
   * 서버에는 해시만 남으므로 **다시 볼 수 없다** — 화면이 `/join?t=` 링크를 한 번 보여 주고
   * 잃어버리면, 팀장이 계정과 기기에서 새로 만들어야 한다. 그래서 팀을 만든 화면이 이 값을
   * 받아 링크를 조립한다.
   */
  inviteToken?: string;
  memberCount: number;
  /** "중간발표 D-12" 같은 표시 문자열. 서버가 날짜를 주면 화면에서 계산하도록 바꿀 것. */
  dday: string | null;
};

export type Member = {
  id: string;
  name: string;
  /** 지금 보고 있는 사용자 본인인지. */
  isMe: boolean;
  mbti: MbtiType | null;
  /** 1순위 희망 역할. */
  want: RoleKey | null;
  /** 이번엔 피하고 싶은 역할. */
  veto: RoleKey | null;
};

/**
 * 시간표를 막는 사유. 기획안에 적힌 세 종류에 더해, 본인이 이름을 붙이는 `custom` 이 있다.
 * `custom` 의 이름은 `BusyBlock.label` 에 있다.
 */
export type BusyKindKey = "class" | "work" | "exam" | "custom";

export type BusyKind = {
  key: BusyKindKey;
  name: string;
  /** CSS 변수 참조(`var(--busy-class)`). 화면 코드에 hex 를 적지 않기 위한 것. */
  color: string;
};

/**
 * 안 되는 시간 한 칸.
 *
 * 기획안의 시간표는 "안 되는 시간만 표시"한다 — 표시하지 않은 시간은 가능한 시간이다.
 * 사유(`kind`)는 본인에게만 보이고, 팀원에게는 가능/불가만 공유된다.
 */
export type BusyBlock = {
  id: string;
  /** `SCHEDULE_DAYS` 의 인덱스(0 = 월). */
  day: number;
  /** `SCHEDULE_HOURS` 의 인덱스. */
  startHour: number;
  /** 몇 시간짜리인지. */
  hours: number;
  kind: BusyKindKey;
  /** `kind` 가 `custom` 일 때 본인이 붙인 이름. 그 밖에는 null. 본인에게만 보인다. */
  label: string | null;
  /** null = 매주. 값이 있으면 그 주에만(그 주 월요일, "2026-09-28"). */
  weekOf: string | null;
};

/** 시간표에서 고를 수 있는 한 주. 이름·기간은 서버가 만든다(화면과 서버의 "오늘"이 어긋나지 않게). */
export type ScheduleWeek = {
  key: string;
  /** "이번 주" / "다음 주" */
  name: string;
  /** "9/28–10/2" */
  range: string;
};

/**
 * 팀 겹쳐보기의 팀원 한 명.
 *
 * **사유(`kind`)는 싣지 않는다** — 수업·아르바이트·시험은 본인에게만 보이는 값이라,
 * 화면에서 가리는 게 아니라 서버가 애초에 보내지 않는다.
 */
export type TeamTimetable = {
  id: string;
  name: string;
  isMe: boolean;
  mbti: MbtiType | null;
  /** 안 되는 시간을 하나라도 적었는지. 안 적은 사람은 모든 시간이 가능한 것으로 센다. */
  submitted: boolean;
  /** `weekOf` 가 null 이면 매주, 아니면 그 주에만. */
  busy: Array<{ day: number; startHour: number; hours: number; weekOf: string | null }>;
  /** 오늘 내가 이 사람에게 시간표를 이미 부탁했는지. */
  askedToday: boolean;
};

/** 회의 시간 후보. 적합도 점수는 만들지 않는다 — 몇 명이 되는지와 사유만 보여 준다. */
export type MeetingSlot = {
  id: string;
  /** 요일 한 글자("수"). */
  day: string;
  /** "16:00 – 18:00" */
  time: string;
  /** 참석 가능 인원. */
  available: number;
  /** 팀 전체 인원. */
  total: number;
  /** 못 오는 사람과 사유("박지호 · 아르바이트"). 전원 가능하면 `null`. */
  blockedBy: string | null;
};

/**
 * 지금 올라와 있는 회의 제안.
 *
 * 확정 규칙: **특정 한 사람이 단독으로 확정하지 않는다.** 응답 마감까지 반대가 없어야
 * 확정되고, 누구든 반대하면 확정되지 않는다.
 *
 * `idle` 은 제안이 아직 없는 상태다.
 */
export type MeetingProposal = {
  stage: "idle" | "proposed" | "confirmed" | "carried";
  slot: MeetingSlot | null;
  /**
   * 이 회의가 있는 날 — "2026-09-30" (`week.ts` 의 날짜 문자열과 같은 형태).
   *
   * 후보 행에는 요일("수")로만 남으므로, 이것이 없으면 확정된 회의가 한 달을 넘겨 살아도
   * "언제인지"를 말할 수 없다. 예전 행은 null 이다.
   */
  date: string | null;
  agreed: number;
  /** 아직 응답하지 않은 사람 수. */
  pending: number;
  against: number;
  /** "9/20 15:00" 같은 표시 문자열. 제안이 없으면 null. */
  respondBy: string | null;
  /** 내가 이미 응답했는지 — 같은 사람이 두 번 누르지 않게 한다. */
  myResponse: "agree" | "against" | null;
};

/** 한 주의 회의 시간 후보와 그 주의 상황. */
export type MeetingWeek = {
  slots: MeetingSlot[];
  /** 전원이 가능한 후보가 하나라도 있는지. false 면 10번 화면 흐름으로 간다. */
  hasFullAvailability: boolean;
  /** 시간표를 낸 인원. */
  submitted: number;
  total: number;
};

/**
 * 추첨 도구 — 협의가 안 될 때 역할을 뽑는 방법.
 * 결과가 달라 보일 뿐 다 같은 무작위 추첨이다. 고르는 재미를 위한 표시.
 */
export type RandomTool = {
  key: string;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
};

/** 온보딩에서 사용자가 입력한 값 — 마지막 단계에서 한 번에 서버로 보낸다. */
export type OnboardingDraft = {
  name: string;
  /**
   * 로그인용 이메일. **선택** — 없어도 팀 들어가기는 그대로 된다.
   *
   * 적어 두면 나중에 새 기기에서 재접속할 때 12자리 재입장 코드를 찾지 않고 인증번호로
   * 들어간다(02 이름 화면). 팀에 들어온 뒤 `계정과 기기` 에서도 등록·변경할 수 있다.
   */
  email?: string | null;
  mbti: MbtiType | null;
  /** MBTI 를 직접 고르지 않고 04 성향 체크로 얻었는지. 결과 화면 문구가 달라진다. */
  mbtiFromQuiz: boolean;
  want: RoleKey | null;
  veto: RoleKey | null;
};

/* ── 알림 ───────────────────────────────────────────────────── */

/** 앱 안 알림 한 줄. 같은 알림이 푸시로도 나가지만(푸시가 없으면 이것만 남는다), 형태는 같다. */
export type AppNotification = {
  id: string;
  kind: "poke" | "meeting" | "schedule-ask" | "contrib-dispute" | "contrib-confirm" | "join-request" | "rejoin-request" | "icebreak" | "who-does-it" | "drive";
  title: string;
  body: string;
  href: string | null;
  when: string;
  read: boolean;
};

/* ── 11 홈 ─────────────────────────────────────────────────── */

/** AI 도구 목록. 14번 허브와 홈의 바로가기가 같은 목록을 쓴다. */
export type AiTool = {
  key: string;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  note: string;
  /** 아직 열지 않은 도구는 false. */
  ready: boolean;
  /** 도구 화면 경로. 아직 없으면 null. */
  href: string | null;
};

/**
 * AI 이용·보관 정책.
 *
 * 숫자 셋 다 기획안에 없어 임시로 정한 값이다(핸드오프 "확정되지 않은 정책" 표).
 * 화면이 `<Undecided>` 로 그 사실을 적고 있다.
 */
export type AiPolicy = {
  /** 사용 기록(횟수)을 남겨 두는 기간. 입력한 글과 결과는 애초에 저장하지 않는다. */
  retentionDays: number;
  /** 한 팀이 하루에 부를 수 있는 횟수. */
  perTeamPerDay: number;
  /** 한 사람이 하루에 부를 수 있는 횟수. 한 사람이 팀 몫을 다 쓰지 못하게 한다. */
  perMemberPerDay: number;
  /**
   * **읽기 순화만 쓰는** 한도(하루). 위 두 값과 **따로** 센다.
   *
   * 왜 따로 세는가: 순화는 누가 누를 때만 일어나는 것이 아니라 **대화방을 열면 알아서** 돈다.
   * 같은 장부를 쓴다면 한 사람이 대화방을 많이 여는 것만으로 팀의 쿠션 번역기·리서처 몫이
   * 바닥나고, 그때 화면이 말하는 것은 "한도를 다 썼습니다" 다 — 실제로는 순화가 썼다는 사실이
   * 그 자리에 없다. 그래서 **몫을 나눠 각각 세운다.** 어느 쪽이 얼마를 썼는지는 여전히
   * 한 `AiUsage` 표에 함께 남는다(스키마는 그대로).
   */
  readCushionPerTeamPerDay: number;
  readCushionPerMemberPerDay: number;
};

/**
 * AI 도구의 결과.
 *
 * 실패를 **던지지 않고 돌려준다.** 운영 빌드의 Next 는 서버에서 던진 오류의 문구를 지우고
 * `digest` 만 클라이언트로 보낸다 — 즉 `throw new Error("오늘 한도를 다 썼습니다")` 는
 * 사용자에게 절대 닿지 않는다. 돌려주는 값은 그냥 데이터라서 그대로 도착한다.
 */
export type AiResult<T> =
  | { ok: true; value: T; source: AiAnswerSource }
  | { ok: false; message: string };

/**
 * `ok: true` 로 돌아온 값이 **모델이 만든 것인지, 미리 적어 둔 예시인지**.
 *
 * 이 값이 없는 이유는 예전에는 성공을 "일했다"로만 봤기 때문이다. 그런데 키가 없을 때는
 * 다섯 도구 전부가 **샘플을 결과 자리에 그대로 돌려주었다** — 버튼을 누르고 "다듬는 중…"이
 * 지나갔는데 화면에는 사용자의 원문과 상관없는 예시가 "다듬은 대본"으로 놓였다. 그래서
 * 화면마다 `isAiConfigured()` 를 다시 보고 자기 방식으로 알아내려 했고, forgets한 곳에서
 * 다시 사람이 만든 것처럼 보이게 되었다.
 *
 * **누가 만들었는지를 사용자에게 알릴 책임은 서버에 있다.** 화면이 추측할 필요가 없도록
 * 결과와 함께 돌려준다.
 */
export type AiAnswerSource =
  /** 모델이 실제로 만들어 준 결과. */
  | "ai"
  /** 키가 없어 미리 적어 둔 예시. 이건 모델이 한 일이 아니다. */
  | "sample";

/** 쿠션 번역기의 말투. 요구 내용은 그대로 두고 말투만 바꾼다. */
export type CushionTone = { key: string; name: string };

/**
 * 읽기 순화의 강도.
 *
 * `OFF` 는 강도가 아니라 **끄는 상태** 다 — 그래서 여기 없고 `ReadCushionSetting.enabled`
 * 로 따로 둔다(끄기 전에 고른 단계를 잃지 않으려고).
 */
export type CushionLevelKey = "LIGHT" | "NORMAL" | "STRONG";

export type CushionLevel = {
  key: CushionLevelKey;
  name: string;
  /** 화면에서 무엇을 약속하는지. 한 줄. */
  desc: string;
};

/** 27 상황별 문장 변환의 모드. 쿠션 번역기(말투)와는 다른 기능이다. */
export type SentenceMode = {
  key: string;
  name: string;
  desc: string;
};

/** AI 서기가 회의 메모에서 뽑은 할 일 후보. **초안일 뿐 그대로 반영되지 않는다.** */
export type ClerkCandidate = {
  id: string;
  title: string;
  /** AI 가 추측한 담당자. 회의에서 정해지지 않았으면 null 이고 사람이 정해야 한다. */
  assignee: string | null;
  /** 왜 이 사람을 넣었는지 — 근거 없이 배정하지 않는다. */
  basis: string;
  due: string;
};

export type ClerkDraft = {
  summary: string;
  candidates: ClerkCandidate[];
};

/** 리서처 결과. **출처가 없는 결과는 보여주지 않는다.** 적합도 점수는 만들지 않는다. */
export type ResearchResult = {
  id: string;
  title: string;
  source: string;
  snippet: string;
  /**
   * 열어 볼 수 있는 주소. 열 수 없는 출처는 확인할 수 없는 출처다.
   *
   * 샘플 결과에는 없어서 `null` 이 될 수 있다 — 화면은 그때 링크를 만들지 않는다.
   */
  url: string | null;
};

/** 발표 지원 결과 — 표현만 다듬고 내용을 새로 지어내지 않는다. */
export type PresentDraft = {
  refined: string;
  questions: string[];
};

/**
 * "최근 자료·업무"의 할 일 줄 식별자.
 *
 * 이 줄의 설명("3건 남음")만 홈이 실제 목록에서 세어 채운다. 양쪽이 문자열을 따로 적으면
 * 한쪽만 바뀌었을 때 건수가 조용히 사라진다 — 실제로 그렇게 사라져 있었다.
 */
export const TASKS_RECENT_ID = "tasks";

/** 홈의 "최근 자료·업무" 한 줄. */
export type RecentItem = {
  id: string;
  title: string;
  note: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  /** 눌렀을 때 갈 곳. 갈 곳이 없는 줄은 만들지 않는다(`getRecentItems`). */
  href: string;
};

/* ── 12 / 13 / 22 드라이브 ──────────────────────────────────── */

/** 팀 드라이브 이용 제한. 아직 확정되지 않은 정책(2GB 가 충분한지 팀 확인 필요). */
export type DriveLimits = {
  capGB: number;
  usedGB: number;
  /** 허용 파일 형식 표시용("문서"·"이미지"·"PPT"·"PDF"). */
  types: string[];
};

/**
 * 역할별 제출함.
 *
 * 마감이 지나도 제출함을 **잠그지 않는다** — 늦게라도 내는 편이 안 내는 것보다 낫고,
 * 대신 마감을 지난 파일에 "마감 후 제출" 라벨이 자동으로 붙는다.
 */
export type SubmissionBox = {
  id: string;
  role: RoleKey;
  name: string;
  /** 이 칸을 맡은 사람. 역할이 정해지기 전에는 null. */
  owner: string | null;
  /** 안에 들어 있는 파일 수. */
  fileCount: number;
  /** 화면에 보일 마감("9/15 23:59"). 정하지 않았으면 "미정". 서버가 한국 시간으로 만든다. */
  due: string;
  /** 마감 입력칸의 값("2026-09-15T23:59", 한국 시간). 정하지 않았으면 null. */
  dueAt: string | null;
  /** 마감을 지나 올라온 파일이 있는지. */
  hasLate: boolean;
};

/** 실제로 열리는 형식과 안내만 하는 형식을 구분하기 위한 종류. */
export type FileKind = "pptx" | "docx" | "pdf" | "image";

/**
 * 제출함 안의 파일 하나.
 *
 * 제출함과 버전 사이에 이 단계가 있다 — 한 제출함에 파일이 여러 개일 수 있고
 * (발표자료.pptx 와 대본.docx), 버전은 **그 파일 하나**의 역사이기 때문이다.
 */
export type SubmittedFile = {
  id: string;
  name: string;
  kind: FileKind;
  versionCount: number;
  /** 최신 버전 정보. 아직 아무것도 올라오지 않았으면 전부 null. */
  latestVersionId: string | null;
  latestLabel: string | null;
  latestBy: string | null;
  latestWhen: string | null;
  size: string | null;
  /** 마감을 지나 올라온 버전이 있는지. */
  hasLate: boolean;
};

/**
 * 파일 버전 하나.
 *
 * 같은 이름으로 다시 올리면 **덮어쓰지 않고 새 버전이 쌓인다** — 이전 버전을 언제든
 * 되찾을 수 있어야 작업이 사라지지 않는다. 복원도 지우는 게 아니라 새 버전을 더한다.
 *
 * 최신 버전은 별도 플래그 대신 **목록의 첫 항목**으로 정한다.
 * 플래그를 들고 다니면 복원 뒤에 두 개가 최신이 되는 일이 생긴다.
 */
export type FileVersion = {
  id: string;
  /** "v4" 처럼 화면에 그대로 보이는 이름. */
  label: string;
  author: string;
  when: string;
  note: string;
  size: string;
  kind: FileKind;
  /** 실제로 열리는 형식만 미리보기 주소를 갖는다. 그 외는 다운로드 안내만. */
  previewUrl: string | null;
  /** 마감을 지나 올라왔는지. 복원으로 생긴 버전은 세지 않는다. */
  isLate: boolean;
};

/* ── 19 / 30 / 31 / 32 채팅 ─────────────────────────────────── */

/** 스레드 식별자. 팀 단톡방은 하나뿐이라 고정값을 쓴다. */
export const TEAM_THREAD_ID = "team";

/**
 * 이 메시지를 이 사람에게 보여 주는 순화 상태(19·31 읽기 순화).
 *
 * 실패도 **보인다** — 실패를 저장하지 않으면 실패를 셀 수도, 다시 부르지 않을 수도,
 * 왜 안 됐는지 나중에 알 수도 없다. `retryAfter` 는 "이 시각 전에는 다시 부르지 않는다" 다.
 */
export type ChatPurified =
  | {
      status: "PURIFIED" | "FALLBACK";
      /** 화면에 그릴 문장. */
      text: string;
      /** 누가 썼나: `ai`(모델) / `mask`(규칙 가림). 라벨이 다르다. */
      kind: "ai" | "mask";
      reason: null;
      retryAfter: null;
    }
  | {
      status: "PENDING" | "REJECTED" | "FAILED";
      text: null;
      kind: null;
      /** 실패 이유(운영 지표용 — 화면에는 안 보여 준다). */
      reason: string | null;
      /** 이 시각 전에는 다시 부르지 않는다. 재생성 가능하면 서버가 지금으로 옮긴다. */
      retryAfter: string | null;
    };

/** 메시지에 붙은 반응. 지금은 표시만 하고 누를 수는 없다. */
export type MessageReaction = {
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  count: number;
};

/**
 * 채팅 메시지 하나. 단톡방(19)과 DM(31)이 같은 말풍선 규격을 쓴다.
 */
export type ChatMessage = {
  id: string;
  author: string;
  mbti: MbtiType | null;
  /** 내가 보낸 말인지 — 말풍선이 오른쪽에 붙고 색이 달라진다. */
  isMine: boolean;
  text: string;
  /** 보낸 시각 표시. 아직 못 보낸 메시지는 null. **사람이 읽는 문자열이라 정렬에 쓸 수 없다.** */
  time: string | null;
  /**
   * 순서를 정하기 위한 실제 시각(ISO, UTC). `time` 은 "21:12" 같은 표시용이라
   * `Date.parse` 가 NaN 이고, dayjs 없이도 비교할 수 있게 따로 실어 보낸다.
   * 아직 서버에 도착하지 않은 말은 null — 그 말은 지금 이 순간 이후에 생긴 것으로 본다.
   */
  sortAt: string | null;
  /** `sending` 은 서버 응답을 기다리는 중인 낙관적 말풍선. */
  status: "sent" | "sending" | "failed";
  /**
   * 쿠션 번역기로 다듬어 보낸 말.
   * **표시가 남는다** — 다듬었다는 사실을 숨기지 않는다.
   */
  viaCushion?: boolean;
  /**
   * **나에게** 이 말을 어떻게 보여 줄 것인가(읽기 순화, 19·31). 아직 아무것도 없으면 null.
   *
   * `text` 가 있는 상태(`PURIFIED`/`FALLBACK`)만 화면에 그릴 문장을 갖는다. 실패 상태는
   * `text: null` 이고 화면은 **원문**을 그린다.
   *
   * `kind` 로 **누가 쓴 문장인지** 구분한다 — AI 가 쓴 순화문과 규칙으로 가린 문장은 라벨이
   * 다르다. AI 가 아닌데 "순화됨" 이라 쓰면 그건 거짓말이다.
   */
  purified: ChatPurified | null;
  reactions?: MessageReaction[];
  /** 첨부 파일(단톡방만). 여는 주소는 볼 때마다 서버가 새로 만든다(`getChatAttachmentUrl`). */
  attachment?: ChatAttachment;
  /** 드라이브에서 공유한 파일(단톡방만). **바이트를 복사하지 않고 그 버전만 가리킨다.** */
  driveFile?: SharedDriveFile;
};

export type ChatAttachment = {
  name: string;
  size: string;
  /** 이미지면 말풍선 안에 바로 그린다. 그 밖의 형식은 파일 줄로 보이고 누르면 연다. */
  image: boolean;
  /**
   * 이 첨부를 드라이브에 올려 만든 버전으로 가는 길.
   *
   * 있으면 첨부 아래에 "드라이브에 있음" 이라고 **버튼 대신 길**을 보여 준다 — 같은 바이트를
   * 두 번 올리면 팀 용량에 두 번 세어지므로 다시 만들지 않는다.
   */
  savedHref: string | null;
};

/**
 * 드라이브에서 단톡방에 공유한 파일 한 장.
 *
 * 첨부와 다른 점: 이건 **저장소 객체를 가리키기만 한다.** 그래서
 * - 드라이브 용량에 두 번 세지지 않는다,
 * - 드라이브에 새 버전이 생기지 않는다(버전 이름·기여 기록이 공유로 어그러지지 않는다),
 * - 드라이브에서 그 버전을 복원해도 공유 카드는 그 옛 버전의 이름을 그대로 보여 준다
 *   (공유한 시점의 것이었다는 사실이 남는다).
 */
export type SharedDriveFile = {
  name: string;
  /** 공유한 시점의 버전 이름("v4"). */
  label: string;
  size: string;
  /** `FileKind` — 어떤 형식인지. */
  kind: FileKind;
  /** 드라이브의 그 버전으로 가는 길. */
  href: string;
};

/** 1:1 대화 목록의 한 줄. 팀원 한 명당 하나씩 열린다. */
export type DmThread = {
  /** 상대 팀원의 id. 그대로 스레드 id 로 쓴다. */
  id: string;
  name: string;
  mbti: MbtiType | null;
  lastMessage: string;
  time: string;
  unread: number;
};

/* ── 16 / 17 / 18 / 23 기여도 ───────────────────────────────── */

/**
 * 기여 기록의 종류.
 *
 * ⚠️ 이 목록이 곧 "무엇을 기여로 보는가"의 정의다.
 * **MBTI·채팅량·친목은 들어 있지 않고, 들어가서도 안 된다.**
 */
export type ContribKindKey = "task" | "file" | "meet" | "help" | "due";

export type ContribKind = {
  key: ContribKindKey;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
};

/**
 * 내 기여 기록 한 줄.
 *
 * `auto` 는 앱이 드라이브 버전 기록·회의 참석 등에서 모은 것이고,
 * `self` 는 앱 밖에서 한 일을 본인이 직접 넣은 것이다.
 * 직접 넣은 기록은 **팀원 확인을 거치기 전까지 `pending` 으로 남는다** —
 * 본인 말만으로 확정되면 기록의 의미가 없어진다.
 */
export type ContribRecord = {
  id: string;
  kind: ContribKindKey;
  title: string;
  detail: string;
  when: string;
  source: "auto" | "self";
  /** `disputed` = 팀원이 사실과 다르다고 적은 것. 본인이 알아야 한다 — 접으면 숨겨진다. */
  state: "ok" | "pending" | "disputed";
  evidence: ContribEvidence | null;
};

/** 기록에 붙은 근거 파일. 여는 주소는 볼 때마다 서버가 새로 만든다(`getEvidenceUrl`). */
export type ContribEvidence = { name: string; size: string };

/** 누가 무엇을 적었는지로 된 의견 하나. */
export type ContribOpinion = { who: string; text: string };

/**
 * 팀이 정한 확정 기준(17 화면).
 *
 * `max` 는 팀원 수에서 1을 뺀 만큼이다 — **자기 기록은 자기 자신이 확인하지 못하므로** 그보다
 * 큰 기준은 아무도 채울 수 없다. 서버는 그 값을 넘겨 받은 것을 버린다.
 *
 * `canChange` 는 화면이 버튼을 감추기 위한 값이고, **바꾸는 쪽은 서버가 `requireLeader` 로
 * 다시 확인한다.**
 */
export type ConfirmsPolicy = {
  /** 지금 기준 몇 명인지. */
  needed: number;
  /** 올릴 수 있는 최댓값. */
  max: number;
  /** 팀장만 바꿀 수 있다. */
  canChange: boolean;
};

/**
 * 팀원이 확인해야 하는 기록.
 *
 * `disputed` 는 누군가 사실과 다르다고 적은 항목이다.
 * **한쪽 말로 덮지 않고 둘 다 남긴다.**
 */
export type TeamCheckRecord = {
  id: string;
  who: string;
  title: string;
  state: "ok" | "pending" | "disputed";
  /** 내 기록인지. 자기 기록은 확인하거나 정정을 적을 수 없다. */
  isMine: boolean;
  /** 지금까지 확인해 준 팀원 수. */
  confirms: number;
  /** 내가 이미 확인했는지. */
  iConfirmed: boolean;
  /**
   * 정정에 응답할 수 있는 사람인가.
   *
   * **기록 주인과 지금 의견을 적은 사람뿐이다**(`server/contrib/state.ts` 의
   * `canResolveContrib` 가 정한다). 전원이 응답하면 아무나 남긴 의견에 답할 수 있어서 결정이
   * 되지 않는다.
   *
   * 화면이 이 값으로 버튼을 감추지만 **권한은 서버가 다시 확인한다** — 서버 액션은 화면을
   * 거치지 않고 POST 로 바로 불릴 수 있다.
   */
  iCanResolve: boolean;
  /** 확인 상태를 사람 말로 적은 것("3명 확인", "이서연 확인 대기"). */
  by: string;
  /** 확인할 때 열어 볼 근거 파일. 없으면 null. */
  evidence: ContribEvidence | null;
  /** 의견 차이가 적힌 경우 그 내용. 정리된 뒤에도 지우지 않는다. */
  dispute: string | null;
  /**
   * 이 기록에 달린 **전체 의견**, 시간순.
   *
   * `dispute` 는 지금 떠 있는 의견 하나만 가리킨다. 새로 의견이 달리면 앞선 의견이
   * 덮였고, 기록의 주인이 적어 둔 말이 화면에서 사라졌다. 이력으로 남겨 두었으므로
   * 화면은 이 배열을 전부 보여 준다 — 오래된 의견에도 "그 뒤 정리됐습니다" 처럼
   * 현재 상태가 붙는다.
   */
  history: ContribOpinion[];
  /**
   * 정정에 어떻게 답했는지. 이 값이 있으면 의견 차이는 정리된 것이다.
   *
   * `dispute` 와 **함께** 남는다 — 적힌 의견을 지우고 결론만 남기면
   * 한쪽 말로 덮는 것이 되어 정정을 요구한 사람이 기록을 믿을 수 없게 된다.
   */
  resolution: string | null;
  /**
   * 이 기록의 회의 참여 표시. **표시 중인 것을 먼저, 없으면 가장 최근에 취소된 것.**
   *
   * 둘을 함께 주지 않는다 — 지금 표시 중인지와 예전에 있었는지를 화면이 따로 판단하게 두면
   * 어느 쪽을 사실로 말할지 두 군데로 갈라진다(`features/contrib/participation.ts`).
   * 한 번도 표시된 적 없으면 `null`.
   */
  participation: Participation | null;
  /**
   * 내가 이 기록을 **확인할 수 없는 이유** — `null` 이면 됩니다.
   *
   * 화면이 버튼을 감추면서 **왜인지도 같이 말한다.** 주소로 서버 액션을 부르면 화면과 무관하게
   * 들어올 수 있으므로, 조건은 `features/contrib/resolution.ts` 의 `canConfirm` 한 곳이 정한다.
   */
  confirmBlockedBy: string | null;
  /**
   * 답이 없어 닫힌 의견인지(`resolution.ts` 의 `unresolvedAfter`).
   *
   * 결론은 적혀 있어 확인 절차는 돌아가지만 반대가 표에 남아 있다 — 리포트는 이 값을
   * "정리되지 않은 의견"으로 센다.
   */
  unresolved: boolean;
  /**
   * 의견 차이를 1:1 로 이야기할 상대의 id(= DM 스레드 id).
   *
   * 내 기록이면 의견을 적은 사람, 아니면 기록 주인이다. 그 사람이 팀을 나갔거나
   * 나 자신이면 `null` — 열리지 않을 대화방으로 보내지 않는다.
   */
  dmWith: string | null;
};

/**
 * 리포트 한 줄.
 *
 * 세 수치 모두 **같은 표를 서버가 센다** — 16·17 화면과 어긋날 수 없다.
 * 점수도 순위도 없고, 미확인·의견 차이를 감추지도 않는다.
 */
export type ContribReportRow = {
  memberId: string;
  who: string;
  /** 팀을 나갔다 온 사람인지. 기록은 남으므로 줄도 남고, 구분만 해 준다. */
  left: boolean;
  /** 합의한 역할 이름. */
  role: string;
  confirmed: number;
  pending: number;
  disputed: number;
  /**
   * **현재 표시 중인** 참여 표시 수 — 팀장이 직접 찍은 것만 센다(취소한 것은 빼고).
   *
   * 숫자로는 보여 주되 정렬·강조하지 않는다. "점수·순위를 만들지 않는다"는 이 리포트의 첫
   * 원칙이라, 이 수를 보고 사람끼리 비교하는 일은 화면이 유도하지 않는다.
   */
  participations: number;
  /**
   * **답이 없어 닫힌 의견** 수 — 결론이 "합의 없음 · 원문 유지" 인 기록.
   *
   * 확인 절차는 돌아갔지만 반대가 표에 남아 있다. 이걸 숨기면 "아무도 이의가 없었다"고
   * 읽히는 문서가 되므로 센다.
   */
  unresolved: number;
};

/* ── 21 / 24 할 일 · 콕 찌르기 ──────────────────────────────── */

/** 할 일의 종류. 팀 업무와 개인 학습을 한 목록에서 구분하기 위한 것. */
export type TaskKindKey = "team" | "study" | "check";

export type TaskKind = {
  key: TaskKindKey;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
};

/** 할 일 하나. 상태는 `STATUS` 어휘를 공유한다(할 일 → 진행 중 → 완료). */
export type Task = {
  id: string;
  title: string;
  kind: TaskKindKey;
  /** 담당자. 아직 정해지지 않았으면 null — 비워 두는 것이 임의 배정보다 낫다. */
  assignee: string | null;
  mbti: MbtiType | null;
  /** 그 담당자가 이미 팀을 나갔는지. 알림은 닿지 않는다 — 화면이 확인해야 한다. */
  assigneeLeft: boolean;
  /** 이 업무의 담당자가 나인지. */
  isMine: boolean;
  due: string;
  status: "todo" | "doing" | "done";
  /** AI 서기가 만든 항목인지 사람이 직접 넣은 것인지. 화면에 배지로 남는다. */
  source: "clerk" | "manual";
  /**
   * 담당자·제목을 **고칠 수 있는지**. 화면이 서버와 같은 규칙으로 판단하려고 계산해 보낸다
   * (`server/actions/tasks.ts` 의 `canEditTask`). 화면에서 막지 않아도 서버가 막지만,
   * 버튼을 감춘 뒤 **왜**인지 말하지 않으면 조용히 눌러도 되는 것처럼 보인다.
   */
  canEdit: boolean;
  /** 막혔을 때 **왜**인지. 넣기 전부터 있던 할 일은 팀장만 고칠 수 있다(`createdById` 가 없다). */
  editBlockedBecause: "not-creator" | "leader-only" | null;
};

/* ── 28 / 29 팀 친목 ────────────────────────────────────────── */

export type IceGameKey = "liar" | "mafia";

export type IceGame = {
  key: IceGameKey;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  desc: string;
  /** "게임 방법" 칸에 차례대로 보이는 줄. */
  howTo: string[];
  /** 이보다 적으면 시작하지 않는다. 서버도 같은 값으로 막는다. */
  minPlayers: number;
  /** 실행까지 연결된 게임인지. false 면 설명만 볼 수 있다. */
  playable: boolean;
};

/** 라이어: liar | citizen / 마피아: mafia | police | doctor | citizen */
export type IceRole = "liar" | "citizen" | "mafia" | "police" | "doctor";

/**
 * 한 판을 **내 눈으로 본 모습.** 서버가 보는 사람마다 따로 만든다.
 *
 * 남의 역할·제시어는 결과가 공개되기 전에는 여기 들어오지 않는다 — 화면에서 가리는 것이
 * 아니라 애초에 내려보내지 않는다.
 */
export type IceView = {
  roundId: string;
  /** 보는 사람의 팀원 id. 명단에서 "나"를 찾는 데 쓴다. */
  meId: string;
  game: IceGameKey;
  phase: "play" | "revealed";
  hostName: string;
  /** 사회자(판을 연 사람)이거나 팀장이면 공개·마감·끝내기를 할 수 있다. */
  canHost: boolean;
  /** 내 자리. 판이 시작된 뒤에 들어온 사람은 null — 구경만 한다. */
  me: {
    role: IceRole;
    alive: boolean;
    voteForId: string | null;
    /** 라이어 게임의 주제. 라이어도 주제는 안다. */
    topic: string | null;
    /** 제시어. 라이어에게는 null. */
    word: string | null;
    /** 마피아끼리는 서로를 안다. 그 밖의 역할에는 빈 배열. */
    allies: string[];
  } | null;
  players: { id: string; name: string; alive: boolean }[];
  /** 지금 투표에 참여한 사람 수 / 투표할 수 있는 사람 수. 누가 누구를 골랐는지는 공개 전까지 모른다. */
  votes: { cast: number; total: number };
  /** 마피아에서 지금까지 탈락한 순서. 라이어 게임은 빈 배열. */
  eliminated: { name: string; how: "vote" | "night" }[];
  /** 결과 공개 뒤에만 있다. */
  result: {
    roles: { name: string; role: IceRole }[];
    word: string | null;
    tally: { name: string; votes: number }[];
    outcome: string;
  } | null;
};

/* ── 07 역할 조율 ───────────────────────────────────────────── */

/**
 * 한 역할의 추첨 결과. `accepted` 가 true 여야 최종 확정이다.
 *
 * 조율 순서: 선호 확인 → 협의 → (필요하면) 추첨 → 당사자 수락 → 최종 확정.
 * 거절은 오류가 아니라 남은 후보끼리 다시 추첨하는 정상 절차다.
 */
export type RoleDrawResult = {
  /** 어떤 도구로 뽑았는지 — "룰렛" 처럼 화면에 그대로 보인다. */
  tool: string;
  winner: string;
  /**
   * 당첨자 **id**.
   *
   * 이름은 바꿀 수 있는 값이라 당첨자 비교를 이름으로 하면, 같은 이름이 생겼을 때
   * 화면은 "나" 라고 판단하고 서버는 남이라 판단해 어긋난다(서버는 `roles.ts` 에서
   * 이미 id 로 본다). 화면이 고치는 판은 id 로 한다.
   */
  winnerId: string;
  accepted: boolean;
  /**
   * 당첨자가 그 사이에 팀을 나갔다.
   *
   * 이런 추첨은 **아무도 풀 수 없다** — 나간 사람의 세션은 사라져
   * (`session.ts`) 수락도 거절도 못 하고, 남은 팀원은 당첨자가 본인이 아니라
   * "not-yours" 로 거절당한다. `drawForRole` 도 자리가 차 있다고 "settled" 라고
   * 말해 다시 뽑는 길까지 막는다. 그래서 무효로 내려보내고 다시 뽑을 수 있게 한다.
   */
  stale: boolean;
};

/** 팀의 역할 조율 현황. */
export type RoleNegotiation = {
  draws: Partial<Record<RoleKey, RoleDrawResult>>;
  /** 역할별로 거절해서 다음 추첨에서 빠지는 사람들. */
  rejected: Partial<Record<RoleKey, string[]>>;
};
