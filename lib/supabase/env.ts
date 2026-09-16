/**
 * 환경 변수 읽기와 검증.
 *
 * Java의 @ConfigurationProperties 검증과 같은 자리다. 값이 없거나 형식이
 * 틀리면 요청을 처리하다 이상한 곳에서 실패하는 대신 여기서 바로 끊는다.
 *
 * process.env는 빌드 시 정적으로 치환되므로 `process.env[name]`처럼
 * 동적으로 접근하지 않고 각 변수를 그대로 적는다.
 */

function required(name: string, value: string | undefined, prefix?: string): string {
  if (!value) {
    throw new Error(
      `환경 변수 ${name}이(가) 없다. .env.local을 확인한다. 예제는 .env.example에 있다.`,
    );
  }
  if (prefix && !value.startsWith(prefix)) {
    // 값 자체는 오류 메시지에 넣지 않는다. 로그에 키가 남으면 안 된다.
    throw new Error(`환경 변수 ${name}의 형식이 올바르지 않다. ${prefix}로 시작해야 한다.`);
  }
  return value;
}

/**
 * 브라우저에 노출되는 값. RLS가 접근을 막는다는 전제로 공개한다.
 * NEXT_PUBLIC_ 접두사가 붙은 값은 클라이언트 번들에 그대로 포함된다.
 */
export function publicEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, "https://"),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "sb_publishable_",
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
    secretKey: required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY, "sb_secret_"),
  };
}
