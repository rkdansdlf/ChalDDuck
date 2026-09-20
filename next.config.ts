import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * 올린 이미지는 Supabase Storage 의 **서명된 주소**로 온다. 버킷이 비공개라
     * 주소가 매번 달라지고 쿼리에 서명이 붙는다 — 그래서 호스트를 허용해 둬야 한다.
     */
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/**" }],
  },
};

export default nextConfig;
