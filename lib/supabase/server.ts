import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "./env";

/**
 * 서버에서 쓰는 Supabase 클라이언트.
 *
 * 서버라고 secret 키를 쓰지 않는다. publishable 키 + 요청 쿠키의 사용자
 * 토큰으로 동작하므로 RLS가 그대로 적용된다. Java로 치면 관리자 커넥션이
 * 아니라 로그인한 사용자 권한으로 DB를 보는 것과 같다.
 *
 * `cookies()`가 요청마다 다르므로 인스턴스를 전역에 캐시하지 않는다.
 * 요청을 처리할 때마다 새로 만든다.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = publicEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component는 응답 헤더를 이미 보낸 뒤라 쿠키를 쓸 수 없다.
          // 토큰 갱신은 proxy.ts가 맡으므로 여기서는 무시해도 된다.
          // proxy는 S0-05에서 추가한다.
        }
      },
    },
  });
}
