/**
 * 환경 변수 규칙을 한 곳에 둔다.
 *
 * 빌드 시점 검증(next.config.ts)과 실행 시점 검증(env.ts)이 같은 규칙을
 * 봐야 한다. 규칙이 갈라지면 빌드는 통과하는데 실행하면 죽는 상태가 생긴다.
 * 실제로 그렇게 배포된 적이 있다.
 */
export type EnvRule = {
  name: string;
  /** 값이 이 문자열로 시작해야 한다. 없으면 존재 여부만 본다. */
  prefix?: string;
  /** 형식이 틀렸을 때 사람에게 보여줄 설명. */
  hint: string;
};

export const ENV_RULES: EnvRule[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    prefix: "https://",
    hint: "https://<project>.supabase.co 형태여야 한다.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    prefix: "sb_publishable_",
    hint: "sb_publishable_로 시작해야 한다. eyJ로 시작하는 값은 지원이 끝나가는 legacy anon 키다.",
  },
  {
    name: "SUPABASE_SECRET_KEY",
    prefix: "sb_secret_",
    hint: "sb_secret_로 시작해야 한다. eyJ로 시작하는 값은 legacy service_role 키다.",
  },
  {
    name: "OWNER_EMAILS",
    hint: "로그인을 허용할 이메일을 쉼표로 구분해 적는다. 비우면 아무도 로그인하지 못한다.",
  },
];

/**
 * 값이 규칙에 맞는지 본다. 맞으면 null, 틀리면 이유를 돌려준다.
 *
 * 값 자체는 절대 반환하지 않는다. 오류 메시지가 로그에 남으면 키가 새기 때문이다.
 */
export function checkEnvValue(rule: EnvRule, raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return "값이 없다.";
  // 따옴표로 감싼 값은 붙여넣기에서 자주 나오는 실수다.
  if (/^["']|["']$/.test(value)) return "값이 따옴표로 감싸여 있다. 따옴표 없이 적는다.";
  if (rule.prefix && !value.startsWith(rule.prefix)) return rule.hint;
  return null;
}
