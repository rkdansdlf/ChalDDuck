import { ComingSoon } from "@/components/coming-soon";

export default function SchedulePage() {
  return (
    <ComingSoon
      title="일정"
      screens={[
        { no: "08", name: "내 가능한 시간", desc: "주간 격자에 안 되는 시간만 표시 · 목록형 대안 토글" },
        { no: "09", name: "회의 시간 추천", desc: "전원 가능 후보 제안 → 반대 없으면 자동 확정" },
        { no: "10", name: "전원 불가한 주", desc: "최다 인원 대안 · 비대면 요청 · 다음 주 이월" },
      ]}
    />
  );
}
