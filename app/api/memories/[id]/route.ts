import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { parseReviseMemory, parseDeleteMode } from "@/src/server/validation/memory";
import { reviseMemory, deleteMemory, type UpdateResult } from "@/src/server/memory/service";

function toResponse(result: UpdateResult) {
  if (result.ok) return Response.json(result);
  // conflict는 다시 읽고 시도하면 되는 상태다. not_found·gone과 구분한다.
  const status = result.code === "conflict" ? 409 : 404;
  return Response.json({ error: result.message, code: result.code }, { status });
}

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

  const parsed = parseReviseMemory(body);
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400 });

  const supabase = await createClient();
  try {
    return toResponse(await reviseMemory({ supabase, ownerId: owner.id, memoryId: id, ...parsed.value }));
  } catch (error) {
    console.error("기억 정정 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const { id } = await context.params;
  const mode = parseDeleteMode(new URL(request.url).searchParams.get("mode"));
  if (!mode.ok) return Response.json({ error: mode.message }, { status: 400 });

  const supabase = await createClient();
  try {
    return toResponse(await deleteMemory({ supabase, ownerId: owner.id, memoryId: id, mode: mode.value }));
  } catch (error) {
    console.error("기억 삭제 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
