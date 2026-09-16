import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { parseCreateMemory } from "@/src/server/validation/memory";
import { createMemory, listMemories } from "@/src/server/memory/service";

export async function GET(request: Request) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  const supabase = await createClient();

  try {
    return Response.json({ memories: await listMemories({ supabase, ownerId: owner.id, includeInactive }) });
  } catch (error) {
    console.error("기억 조회 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "본문이 JSON이 아니다." }, { status: 400 });
  }

  const parsed = parseCreateMemory(body);
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400 });

  const supabase = await createClient();
  try {
    const created = await createMemory({ supabase, ownerId: owner.id, input: parsed.value });
    return Response.json(created, { status: 201 });
  } catch (error) {
    // 내부 오류 원문을 그대로 내보내지 않는다. 제약 조건이 드러날 수 있다.
    console.error("기억 저장 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
