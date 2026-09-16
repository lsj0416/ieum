import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { parseSendMessage } from "@/src/server/validation/chat";
import { streamMessage } from "@/src/server/conversation/stream";

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

  // 응답은 NDJSON 스트림이다. 거절과 오류도 같은 형식으로 나가므로
  // 클라이언트는 한 가지 방식으로만 읽으면 된다.
  return streamMessage({ supabase, ownerId: owner.id, input: parsed.value });
}
