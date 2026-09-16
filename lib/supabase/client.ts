import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "./env";

/**
 * 브라우저에서 쓰는 Supabase 클라이언트.
 *
 * publishable 키만 쓴다. 이 키는 번들에 그대로 들어가지만, 실제 접근 범위는
 * RLS 정책과 로그인한 사용자의 토큰이 정한다.
 *
 * Client Component에서 호출한다. 매번 새 인스턴스를 만들어도 되며
 * @supabase/ssr이 쿠키를 통해 세션을 공유한다.
 */
export function createClient() {
  const { url, publishableKey } = publicEnv();
  return createBrowserClient(url, publishableKey);
}
