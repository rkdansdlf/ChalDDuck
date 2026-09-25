import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ReviewModeBridge } from "@/lib/review-mode";
import "./globals.css";

/**
 * Pretendard Variable — 찰떡의 유일한 서체. 위계는 웨이트로만 만든다.
 * CDN 대신 저장소에 넣어 두고 `next/font` 로 서빙한다(외부 의존·FOUT 제거).
 */
const pretendard = localFont({
  src: "../styles/fonts/PretendardVariable.woff2",
  weight: "45 920",
  style: "normal",
  display: "swap",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  title: "찰떡",
  description: "팀플을 시작하고, 함께 하고, 제출까지 준비하는 곳",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    title: "찰떡",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBF9F5",
  // 입력창 포커스 시 확대되지 않도록 — 대신 모든 입력창 글자는 16px 이상으로 둔다.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full`}>
      <body className="min-h-full">
        <ReviewModeBridge />
        {children}
      </body>
    </html>
  );
}
