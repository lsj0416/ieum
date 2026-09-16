import type { NextConfig } from "next";
import { ENV_RULES, checkEnvValue } from "./lib/supabase/env-rules";

/**
 * 빌드 시점에 환경 변수를 검증한다.
 *
 * NEXT_PUBLIC_ 변수는 빌드할 때 코드에 박힌다. 값이 잘못된 채로 빌드가
 * 성공하면 배포는 끝났는데 모든 요청이 500인 상태가 만들어지고, 화면에는
 * "Internal Server Error" 한 줄만 나와 원인을 알 수 없다.
 *
 * 존재 여부만 보면 부족하다. 값이 있어도 형식이 틀리면 실행할 때 죽는다.
 * 실제로 legacy anon 키를 넣어 그렇게 배포된 적이 있어서, 실행 시점과
 * 같은 규칙(lib/supabase/env-rules.ts)으로 형식까지 본다.
 */
if (process.env.NODE_ENV === "production") {
  const problems = ENV_RULES.map((rule) => {
    const reason = checkEnvValue(rule, process.env[rule.name]);
    return reason ? `  - ${rule.name}: ${reason}` : null;
  }).filter((line): line is string => line !== null);

  if (problems.length > 0) {
    throw new Error(
      [
        "",
        "환경 변수를 확인해야 한다:",
        ...problems,
        "",
        "로컬이라면 .env.local을 확인한다. 예제는 .env.example에 있다.",
        "Vercel이라면 Settings > Environment Variables에서 값을 고친 뒤",
        "빌드 캐시를 끄고 Redeploy한다. 값을 바꿔도 이전 빌드 결과물은 갱신되지 않는다.",
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
