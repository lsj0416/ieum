import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { reextractImport } from "@/src/server/memory/import-service";

/** 같은 원문으로 후보를 다시 뽑는다. 새 가져오기가 만들어진다. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const { id } = await context.params;
  const supabase = await createClient();

  try {
    const result = await reextractImport({ supabase, ownerId: owner.id, importId: id });
    if (!result.ok) {
      const status =
        result.code === "not_found" ? 404 : result.code === "model_failed" ? 503 : 502;
      return Response.json({ error: result.message, code: result.code }, { status });
    }
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("다시 뽑기 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
