import { ComingSoon } from "@/components/coming-soon";

export default function TeamPage() {
  return (
    <ComingSoon
      title="팀"
      sub="온보딩 다음 화면"
      screens={[
        { no: "07", name: "팀 역할 조율", desc: "역할별 현황 + 팀원별 선호 · 협의→추첨→수락/거절" },
        { no: "16", name: "기여도 · 본인 확인", desc: "자동 수집 기록 확인 + 빠진 기록 추가" },
        { no: "17", name: "기여도 · 팀원 확인", desc: "팀원 기록 확인 · 정정 요청" },
        { no: "18", name: "기여도 · 1장 PDF", desc: "문서형 리포트 · 점수·순위 없음" },
        { no: "23", name: "기여 기록 추가·정정", desc: "근거 첨부 / 정정 응답" },
        { no: "24", name: "익명 콕 찌르기", desc: "업무당 하루 1회 제한" },
        { no: "28", name: "아이스브레이킹", desc: "사과게임 · 라이어게임(준비 중)" },
        { no: "29", name: "친목 · 메뉴 룰렛", desc: "07번 추첨 도구 재사용" },
      ]}
    />
  );
}
