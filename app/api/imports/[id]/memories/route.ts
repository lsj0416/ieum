import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { forgetImportedMemories } from "@/src/server/memory/import-service";

/** 이 가져오기에서 만들어진 기억을 한 번에 잊는다. 행은 남고 status만 바뀐다. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const { id } = await context.params;
  const supabase = await createClient();

  try {
    const result = await forgetImportedMemories({ supabase, ownerId: owner.id, importId: id });
    if (!result.ok) return Response.json({ error: result.message, code: result.code }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    console.error("가져온 기억 잊기 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
