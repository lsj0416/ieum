import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { listConversations } from "@/src/server/conversation/queries";

export async function GET() {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const supabase = await createClient();
  try {
    return Response.json({ conversations: await listConversations(supabase, owner.id) });
  } catch (error) {
    console.error("대화 목록 조회 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
