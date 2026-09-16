import type { NextConfig } from "next";

/**
 * 빌드 시점에 환경 변수를 검증한다.
 *
 * NEXT_PUBLIC_ 변수는 빌드할 때 코드에 박힌다. 값이 없는 채로 빌드가
 * 성공하면, 배포는 끝났는데 모든 요청이 500인 상태가 만들어진다.
 * 그때 나오는 메시지는 "Internal Server Error" 한 줄이라 원인을 알 수 없다.
 *
 * 그래서 빌드를 실패시킨다. 잘못된 결과물이 배포되는 것보다 낫다.
 */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "OWNER_EMAILS",
] as const;

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      [
        "",
        "빌드에 필요한 환경 변수가 없다:",
        ...missing.map((name) => `  - ${name}`),
        "",
        "로컬이라면 .env.local을 확인한다. 예제는 .env.example에 있다.",
        "Vercel이라면 Settings > Environment Variables에 등록한 뒤",
        "빌드 캐시를 끄고 Redeploy한다. 변수를 추가해도 이전 빌드 결과물은 갱신되지 않는다.",
        "",
      ].join("\n"),
    );
  }
}

const nextConfig: NextConfig = {
  devIndicators: {
    // 기본 위치(bottom-left)가 대화 화면의 입력창을 가린다.
    position: "top-right",
  },
};

export default nextConfig;
