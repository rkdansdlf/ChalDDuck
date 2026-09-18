import type { Member, QuizQuestion, Role, Team } from "@/lib/types";

/**
 * 데모 데이터.
 *
 * 핸드오프 `data.js` 를 그대로 옮긴 것으로, **전부 가짜 값**이다(이름·날짜·과목).
 * 서버가 붙으면 `src/data/api.ts` 의 구현만 바꾸고 이 파일은 지운다.
 *
 * 원칙: 기획안에 없는 값은 지어내지 않고 `null` 로 둔다.
 */

export const MOCK_TEAM: Team = {
  id: "team_demo",
  name: "디지털콘텐츠기획 3조",
  course: "디지털콘텐츠기획",
  code: "CD3-7F2Q",
  memberCount: 4,
  dday: "중간발표 D-12",
};

/** 역할 후보 — 기획안의 "역할별 제출함"(자료조사·PPT 템플릿·발표 대본)에서 가져왔다. */
export const ROLES: Role[] = [
  { key: "research", name: "자료조사", note: "논문·기사·통계 수집과 정리" },
  { key: "deck", name: "PPT 제작", note: "템플릿 구성과 슬라이드 작업" },
  { key: "script", name: "발표 대본", note: "대본 작성과 발표 연습" },
  { key: "present", name: "발표", note: "청중 앞 발표와 질의 응답" },
  { key: "manage", name: "일정 관리", note: "마감 관리와 회의 소집" },
];

/**
 * 팀원 목록. 희망/Veto 는 각자 본인이 직접 고른 값이다.
 * 캐릭터 고유 이름은 기획안에 없어 만들지 않는다 — MBTI 유형명을 그대로 쓴다.
 */
export const MOCK_ROSTER: Member[] = [
  { id: "m1", name: "김민준", isMe: true, mbti: "INFJ", want: "research", veto: "present" },
  { id: "m2", name: "이서연", isMe: false, mbti: "ENFP", want: "deck", veto: "manage" },
  { id: "m3", name: "박지호", isMe: false, mbti: "ISTJ", want: "manage", veto: "present" },
  { id: "m4", name: "최유나", isMe: false, mbti: null, want: "research", veto: null },
];

/**
 * 30초 컷 4문항 — 기획안에 적힌 문항 그대로.
 * 정확도·검증 결과는 기획안에 없으므로 화면에서 "진단"이라고 부르지 않는다.
 */
export const QUIZ: QuizQuestion[] = [
  {
    axis: "E / I",
    label: "첫 만남과 소통",
    a: "먼저 말을 걸고 대면·음성으로 친해지기",
    b: "분위기를 살피며 필요한 내용을 텍스트로 소통하기",
  },
  {
    axis: "S / N",
    label: "과제 주제와 기획",
    a: "검증된 사례·통계·기존 자료 활용하기",
    b: "새롭고 독창적인 아이디어 시도하기",
  },
  {
    axis: "T / F",
    label: "피드백과 의견 조율",
    a: "완성도와 논리 중심으로 직접 지적하기",
    b: "팀 분위기를 고려해 부드럽게 전달하기",
  },
  {
    axis: "J / P",
    label: "일정과 마감",
    a: "먼저 일정을 정하고 미리 완성하기",
    b: "유연하게 진행하며 마감에 집중하기",
  },
];
