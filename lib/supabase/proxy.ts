import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "./env";

/** 로그인하지 않아도 접근할 수 있는 경로. */
const PUBLIC_PATHS = ["/login", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * 만료가 다가온 세션 토큰을 갱신하고, 갱신된 쿠키를 응답에 싣는다.
 *
 * Server Component는 응답 헤더를 이미 보낸 뒤라 쿠키를 쓸 수 없다.
 * 그래서 갱신은 여기서 한다. 이게 없으면 사용자가 불규칙하게 로그아웃된다.
 *
 * 여기서 하는 리다이렉트는 낙관적 검사다. Next 문서가 proxy를 완전한
 * 인가 수단으로 쓰지 말라고 명시한다. 실제 접근 판정은 각 페이지에서
 * requireOwner()가 다시 한다.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, publishableKey } = publicEnv();

  // 요청마다 새로 만든다. 전역에 캐시하면 다른 사용자의 세션이 섞인다.
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  // createServerClient와 getClaims() 사이에 다른 코드를 넣지 않는다.
  // 공식 문서가 경고하는 부분으로, 어긋나면 사용자가 무작위로 로그아웃된다.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // supabaseResponse를 그대로 돌려줘야 한다. 새 응답 객체를 만들면
  // 갱신된 쿠키가 빠져 브라우저와 서버의 세션이 어긋난다.
  return supabaseResponse;
}
