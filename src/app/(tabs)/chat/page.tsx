import { ComingSoon } from "@/components/coming-soon";

export default function ChatPage() {
  return (
    <ComingSoon
      title="채팅"
      screens={[
        { no: "32", name: "채팅 (통합 목록)", desc: "팀 대화/개인 대화 필터" },
        { no: "19", name: "팀플 단톡방", desc: "팀 전체 채팅, 전송 실패 시 다시 보내기" },
        { no: "30", name: "1:1 DM 목록", desc: "팀원별 개별 대화 목록" },
        { no: "31", name: "1:1 DM 대화", desc: "단톡방과 동일한 말풍선 규격" },
        { no: "33", name: "채팅 · PC 화면", desc: "1024px 이상 목록/대화/정보 3분할" },
      ]}
    />
  );
}
