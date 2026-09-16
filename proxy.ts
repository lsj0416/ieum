import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next 16부터 middleware가 proxy로 이름이 바뀌었다. 동작은 같다.
 * 프로젝트에 하나만 둘 수 있어서 실제 로직은 lib/supabase/proxy.ts에 있다.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 정적 파일과 이미지 최적화 경로는 세션 갱신이 필요 없다.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
