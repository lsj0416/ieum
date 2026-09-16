import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { addDecision } from "@/src/server/work/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "본문이 JSON이 아니다." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const decision = typeof raw.decision === "string" ? raw.decision.trim() : "";
  if (decision.length === 0) return Response.json({ error: "결정 내용이 비어 있다." }, { status: 400 });

  const supersedesId = typeof raw.supersedesId === "string" ? raw.supersedesId : null;
  if (supersedesId !== null && !UUID.test(supersedesId)) {
    return Response.json({ error: "supersedesId가 UUID 형식이 아니다." }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const result = await addDecision({
      supabase,
      ownerId: owner.id,
      workItemId: id,
      decision,
      reason: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : null,
      supersedesId,
    });
    if (!result.ok) return Response.json({ error: result.message }, { status: 404 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("결정 기록 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
