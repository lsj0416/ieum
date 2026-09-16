import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { archiveTopic, renameTopic } from "@/src/server/topic/service";

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
  if (title.length === 0) return Response.json({ error: "주제 이름이 비어 있다." }, { status: 400 });

  const supabase = await createClient();
  try {
    const result = await renameTopic({ supabase, ownerId: owner.id, topicId: id, title });
    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        { status: result.code === "not_found" ? 404 : 409 },
      );
    }
    // 이름을 바꿔도 ID는 그대로다. 연결된 구간이 끊기지 않는다.
    return Response.json({ id, title });
  } catch (error) {
    console.error("주제 이름 변경 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });
  const { id } = await context.params;

  const supabase = await createClient();
  try {
    // 감추기만 한다. 연결된 구간과 원문은 남는다.
    const ok = await archiveTopic({ supabase, ownerId: owner.id, topicId: id });
    if (!ok) return Response.json({ error: "주제를 찾을 수 없다." }, { status: 404 });
    return Response.json({ id, archived: true });
  } catch (error) {
    console.error("주제 감추기 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
