import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { parseSendMessage } from "@/src/server/validation/chat";
import { sendMessage } from "@/src/server/conversation/service";

/**
 * 대화 API.
 *
 * route.ts는 HTTP만 다룬다. 인증 확인, 본문 검증, 서비스 호출, 상태 코드
 * 매핑까지다. 대화 규칙은 service.ts가 갖는다. Spring의 Controller와
 * Service를 나누는 것과 같은 경계다.
 */
export async function POST(request: Request) {
  // 페이지는 redirect로 보내지만 API는 상태 코드로 답한다.
  const owner = await getOwner();
  if (!owner) {
    return Response.json({ error: "로그인이 필요하다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "본문이 JSON이 아니다." }, { status: 400 });
  }

  const parsed = parseSendMessage(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.message }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const result = await sendMessage({ supabase, ownerId: owner.id, input: parsed.value });

    if (!result.ok) {
      // retryable은 클라이언트가 다시 보내면 되는 상태다. 409로 답하면
      // 영구적인 충돌로 오해하기 쉬워 503으로 구분한다.
      const status =
        result.code === "not_found" ? 404 : result.code === "retryable" ? 503 : 409;
      return Response.json({ error: result.message, code: result.code }, { status });
    }

    return Response.json(result);
  } catch (error) {
    // 내부 오류 원문을 그대로 내보내지 않는다. 테이블 이름이나 제약 조건이
    // 드러날 수 있다. 상세는 서버 로그에만 남긴다.
    console.error("대화 처리 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
