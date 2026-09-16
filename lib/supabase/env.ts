import { ENV_RULES, checkEnvValue, type EnvRule } from "./env-rules";

/**
 * 환경 변수 읽기와 검증.
 *
 * Java의 @ConfigurationProperties 검증과 같은 자리다. 규칙은
 * env-rules.ts에 두고 빌드 시점 검증과 공유한다.
 *
 * process.env는 빌드 시 정적으로 치환되므로 `process.env[name]`처럼
 * 동적으로 접근하지 않고 각 변수를 그대로 적는다.
 */
function rule(name: string): EnvRule {
  const found = ENV_RULES.find((r) => r.name === name);
  if (!found) throw new Error(`알 수 없는 환경 변수 규칙: ${name}`);
  return found;
}

function read(name: string, raw: string | undefined): string {
  const reason = checkEnvValue(rule(name), raw);
  if (reason) {
    // 값 자체는 메시지에 넣지 않는다. 로그에 키가 남으면 안 된다.
    throw new Error(`환경 변수 ${name}을(를) 확인해야 한다. ${reason}`);
  }
  // 붙여넣다 섞인 앞뒤 공백과 줄바꿈은 걷어낸다.
  return raw!.trim();
}

/**
 * 브라우저에 노출되는 값. RLS가 접근을 막는다는 전제로 공개한다.
 * NEXT_PUBLIC_ 접두사가 붙은 값은 클라이언트 번들에 그대로 포함된다.
 */
export function publicEnv() {
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: read(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

/**
 * 서버에서만 읽는 값. RLS를 우회하므로 절대 클라이언트로 내보내지 않는다.
 *
 * 지금은 호출하는 곳이 없다. 관리 작업이 실제로 필요해질 때 쓰고,
 * 그때도 서버 코드에서만 부른다.
 */
export function secretEnv() {
  if (typeof window !== "undefined") {
    throw new Error("secretEnv()를 브라우저에서 호출했다. 서버 코드에서만 사용한다.");
  }
  return {
    secretKey: read("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
  };
}
