import { redirect } from "next/navigation";
import { createClient } from "./server";
import { isOwner } from "./owner";

/**
 * 현재 요청의 소유자 정보. 로그인하지 않았으면 null.
 *
 * getClaims()를 쓴다. getSession()이 돌려주는 user는 서버에서 신뢰하지
 * 않는다. 쿠키는 위조될 수 있고 재검증이 보장되지 않기 때문이다.
 * getClaims()는 매번 JWT 서명을 검증한다.
 */
export async function getOwner(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const email = typeof claims.email === "string" ? claims.email : undefined;
  // 로그인에 성공했더라도 allowlist에 없으면 소유자가 아니다.
  if (!isOwner(email)) return null;

  return { id: String(claims.sub), email: email as string };
}

/**
 * 소유자만 지나갈 수 있는 관문. 아니면 로그인 화면으로 보낸다.
 *
 * proxy의 리다이렉트는 낙관적 검사일 뿐이므로, 보호가 필요한 페이지는
 * 반드시 이 함수를 직접 호출한다. Java의 @PreAuthorize가 컨트롤러마다
 * 붙는 것과 같은 자리다.
 */
export async function requireOwner(): Promise<{ id: string; email: string }> {
  const owner = await getOwner();
  if (!owner) {
    redirect("/login");
  }
  return owner;
}
