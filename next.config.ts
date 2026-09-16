import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    // 기본 위치(bottom-left)가 대화 화면의 입력창을 가린다.
    // 개발 중에만 보이는 표시기이므로 위치만 옮긴다.
    position: "top-right",
  },
};

export default nextConfig;
