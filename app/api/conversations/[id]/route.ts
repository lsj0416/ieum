import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { renameConversation, archiveConversation } from "@/src/server/conversation/service";

const MAX_TITLE = 100;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "본문이 JSON이 아니다." }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>)?.title;
  const title = typeof raw === "string" ? raw.trim() : "";
  if (title.length === 0) return Response.json({ error: "제목이 비어 있다." }, { status: 400 });
  if (title.length > MAX_TITLE) {
    return Response.json({ error: `제목이 너무 길다. (최대 ${MAX_TITLE}자)` }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const ok = await renameConversation({ supabase, ownerId: owner.id, conversationId: id, title });
    // 남의 대화와 없는 대화를 같은 응답으로 다룬다. 존재 여부를 흘리지 않는다.
    if (!ok) return Response.json({ error: "대화를 찾을 수 없다." }, { status: 404 });
    return Response.json({ id, title });
  } catch (error) {
    console.error("대화 제목 변경 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const { id } = await context.params;
  const supabase = await createClient();
  try {
    // 목록에서 감추기만 한다. 원문은 남는다.
    const ok = await archiveConversation({ supabase, ownerId: owner.id, conversationId: id });
    if (!ok) return Response.json({ error: "대화를 찾을 수 없다." }, { status: 404 });
    return Response.json({ id, archived: true });
  } catch (error) {
    console.error("대화 보관 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
