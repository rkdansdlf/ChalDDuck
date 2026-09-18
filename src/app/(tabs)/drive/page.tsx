import { ComingSoon } from "@/components/coming-soon";

export default function DrivePage() {
  return (
    <ComingSoon
      title="드라이브"
      screens={[
        { no: "12", name: "드라이브", desc: "역할별 제출함 · 2GB 용량 · 마감 후 제출 라벨" },
        { no: "13", name: "파일 버전 기록", desc: "버전 목록 · 최신 버전 배지 · 이전 버전 열기" },
        { no: "22", name: "파일 열람·복원", desc: "이미지 미리보기 · 복원은 새 버전으로 추가" },
      ]}
    />
  );
}
