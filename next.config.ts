import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * 올린 이미지는 Supabase Storage 의 **서명된 주소**로 온다. 버킷이 비공개라
     * 주소가 매번 달라지고 쿼리에 서명이 붙는다 — 그래서 호스트를 허용해 둬야 한다.
     */
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/**" }],
  },
  /**
   * 리서처의 "드라이브에 저장" 이 PDF 에 넣는 한글 글꼴(`server/drive/research-pdf.ts`).
   *
   * 코드는 `fs.readFile(path.join(process.cwd(), ...))` 로 읽는데, Next 의 자동 추적은 이
   * 경로를 믿을 수 없다 — 빌드 결과를 보면 이 글꼴이 **드라이브 버전 화면의 함수에만** 실리고
   * 정작 액션을 부르는 `/tools/researcher` 에는 실리지 않았다. 그대로 배포하면 저장할 때마다
   * `ENOENT` 다. 그래서 액션이 실행되는 경로에 직접 건다.
   */
  outputFileTracingIncludes: {
    "/tools/researcher": ["./src/server/drive/fonts/NotoSansKR-Regular-ko.ttf"],
  },
};

export default nextConfig;
