import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { createWorkItem, listWorkItems } from "@/src/server/work/service";

const MAX_TITLE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const includeDone = new URL(request.url).searchParams.get("done") === "1";
  const supabase = await createClient();
  try {
    return Response.json({ items: await listWorkItems({ supabase, ownerId: owner.id, includeDone }) });
  } catch (error) {
    console.error("일 목록 조회 실패:", error);
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

  const raw = body as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length === 0) return Response.json({ error: "일의 제목이 비어 있다." }, { status: 400 });
  if (title.length > MAX_TITLE) {
    return Response.json({ error: `제목이 너무 길다. (최대 ${MAX_TITLE}자)` }, { status: 400 });
  }

  const topicId = typeof raw.topicId === "string" ? raw.topicId : null;
  if (topicId !== null && !UUID.test(topicId)) {
    return Response.json({ error: "topicId가 UUID 형식이 아니다." }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const created = await createWorkItem({
      supabase,
      ownerId: owner.id,
      title,
      goal: typeof raw.goal === "string" && raw.goal.trim() ? raw.goal.trim() : null,
      nextAction: typeof raw.nextAction === "string" && raw.nextAction.trim() ? raw.nextAction.trim() : null,
      topicId,
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    // 소유자가 다른 주제를 붙이려 하면 트리거가 막는다.
    console.error("일 생성 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
