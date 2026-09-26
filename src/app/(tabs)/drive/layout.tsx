import { DriveSeen } from "@/features/drive/drive-seen";

/** 드라이브 탭의 모든 화면 — 열어 본 것을 적어 탭 배지를 지운다. */
export default function DriveLayout({ children }: LayoutProps<"/drive">) {
  return (
    <>
      <DriveSeen />
      {children}
    </>
  );
}
