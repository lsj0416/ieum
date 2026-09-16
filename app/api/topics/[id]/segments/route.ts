import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { linkSegment, unlinkSegment } from "@/src/server/topic/service";

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
  const conversationId = typeof raw.conversationId === "string" ? raw.conversationId : "";
  if (!UUID.test(conversationId)) {
    return Response.json({ error: "conversationId가 UUID 형식이 아니다." }, { status: 400 });
  }
  const startSeq = Number(raw.startSeq);
  const endSeq = Number(raw.endSeq);
  if (!Number.isInteger(startSeq) || !Number.isInteger(endSeq)) {
    return Response.json({ error: "구간 번호가 정수가 아니다." }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const result = await linkSegment({
      supabase, ownerId: owner.id, topicId: id, conversationId, startSeq, endSeq,
    });
    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        { status: result.code === "invalid_range" ? 400 : 404 },
      );
    }
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("구간 연결 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });
  const { id } = await context.params;

  const segmentId = new URL(request.url).searchParams.get("segmentId") ?? "";
  if (!UUID.test(segmentId)) {
    return Response.json({ error: "segmentId가 UUID 형식이 아니다." }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    // 지우지 않고 EXCLUDE로 남긴다. 자동 재연결을 막는 기록이다.
    const ok = await unlinkSegment({ supabase, ownerId: owner.id, topicId: id, segmentId });
    if (!ok) return Response.json({ error: "연결을 찾을 수 없다." }, { status: 404 });
    return Response.json({ topicId: id, segmentId, excluded: true });
  } catch (error) {
    console.error("구간 연결 해제 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
