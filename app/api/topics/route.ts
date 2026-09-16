import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { createTopic, listTopics } from "@/src/server/topic/service";

const MAX_TITLE = 80;

export async function GET() {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });
  const supabase = await createClient();
  try {
    return Response.json({ topics: await listTopics(supabase, owner.id) });
  } catch (error) {
    console.error("주제 조회 실패:", error);
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

  const raw = (body as Record<string, unknown>)?.title;
  const title = typeof raw === "string" ? raw.trim() : "";
  if (title.length === 0) return Response.json({ error: "주제 이름이 비어 있다." }, { status: 400 });
  if (title.length > MAX_TITLE) {
    return Response.json({ error: `주제 이름이 너무 길다. (최대 ${MAX_TITLE}자)` }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const result = await createTopic({ supabase, ownerId: owner.id, title });
    if (!result.ok) return Response.json({ error: result.message, code: result.code }, { status: 409 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("주제 생성 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
