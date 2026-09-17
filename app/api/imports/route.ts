import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { parseCreateImport } from "@/src/server/validation/import";
import { listImports, runImport } from "@/src/server/memory/import-service";

export async function GET() {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  const supabase = await createClient();
  try {
    return Response.json({ imports: await listImports({ supabase, ownerId: owner.id }) });
  } catch (error) {
    console.error("가져오기 목록 조회 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}

/**
 * 붙여넣은 글에서 기억 후보를 뽑는다.
 *
 * 여기서 기억이 만들어지지는 않는다. 후보만 생긴다. 승인은 PATCH에 있다.
 * 모델을 부르므로 다른 API보다 오래 걸린다.
 */
export async function POST(request: Request) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "로그인이 필요하다." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "본문이 JSON이 아니다." }, { status: 400 });
  }

  const parsed = parseCreateImport(body);
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400 });

  const supabase = await createClient();
  try {
    const result = await runImport({ supabase, ownerId: owner.id, input: parsed.value });
    if (!result.ok) {
      // 모델 실패와 형식 불일치를 구분한다. 앞은 다시 시도하면 되고,
      // 뒤는 붙여넣은 내용을 손봐야 한다.
      return Response.json(
        { error: result.message, code: result.code },
        { status: result.code === "model_failed" ? 503 : 502 },
      );
    }
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("맥락 가져오기 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
