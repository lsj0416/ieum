/**
 * 소유자 allowlist.
 *
 * Supabase 대시보드의 가입 차단이 1차 방어선이고, 이것이 2차다.
 * 대시보드 설정을 실수로 되돌리거나 다른 경로로 계정이 생겨도
 * 애플리케이션이 다시 한 번 막는다.
 *
 * 값은 쉼표로 구분한 이메일 목록이다. 비워두면 아무도 통과하지 못한다.
 * 비밀값이 아니므로 .env.example에 형식을 적어둔다.
 */
function allowlist(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * 이 이메일이 소유자인가.
 *
 * 비교 전에 소문자로 맞춘다. Supabase는 이메일을 소문자로 저장하지만
 * 설정 파일에 대문자로 적을 수 있다.
 */
export function isOwner(email: string | undefined | null): boolean {
  if (!email) return false;
  return allowlist().includes(email.toLowerCase());
}

/** 설정이 비어 있으면 로그인 자체가 불가능하므로 시작 시 알 수 있게 한다. */
export function ownerAllowlistIsEmpty(): boolean {
  return allowlist().length === 0;
}
