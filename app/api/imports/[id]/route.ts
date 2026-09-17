import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { parseCandidateDecisions } from "@/src/server/validation/import";
import { decideCandidates, getImport } from "@/src/server/memory/import-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const { id } = await context.params;
  const supabase = await createClient();

  try {
    const found = await getImport({ supabase, ownerId: owner.id, importId: id });
    // 없는 가져오기와 남의 가져오기를 같은 답으로 거절한다. 구분해주면
    // 어떤 id가 존재하는지 알려주는 셈이다.
    if (!found) return Response.json({ error: "가져오기를 찾을 수 없다." }, { status: 404 });
    return Response.json(found);
  } catch (error) {
    console.error("가져오기 조회 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}

/** 후보를 승인하거나 제외한다. 승인한 것만 기억이 된다. */
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

  const parsed = parseCandidateDecisions(body);
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400 });

  const supabase = await createClient();
  try {
    const result = await decideCandidates({
      supabase,
      ownerId: owner.id,
      importId: id,
      decisions: parsed.value,
    });
    if (!result.ok) return Response.json({ error: result.message, code: result.code }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    console.error("후보 결정 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
