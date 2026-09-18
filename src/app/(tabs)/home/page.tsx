import { ComingSoon } from "@/components/coming-soon";

export default function HomePage() {
  return (
    <ComingSoon
      title="홈"
      screens={[
        { no: "11", name: "홈", desc: "내 확인이 필요한 일 → 가까운 일정 → 최근 자료·업무 → AI 도구 바로가기" },
        { no: "21", name: "할 일 · 체크리스트", desc: "팀 업무/개인 학습/점검 구분, 상태 순환" },
        { no: "14", name: "AI 도구 허브", desc: "쿠션 번역기·AI 서기·리서처·발표 지원·문장 변환 진입점" },
      ]}
    />
  );
}
