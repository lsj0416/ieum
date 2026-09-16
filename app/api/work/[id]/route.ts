import { createClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/supabase/auth";
import { updateWorkItem } from "@/src/server/work/service";
import type { WorkStatus } from "@/src/server/work/types";

const STATUSES: WorkStatus[] = ["ACTIVE", "PAUSED", "DONE"];

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

  const raw = body as Record<string, unknown>;
  const status = raw.status;
  if (status !== undefined && (typeof status !== "string" || !STATUSES.includes(status as WorkStatus))) {
    return Response.json({ error: "상태 값이 올바르지 않다." }, { status: 400 });
  }
  const nextAction = raw.nextAction;
  if (nextAction !== undefined && nextAction !== null && typeof nextAction !== "string") {
    return Response.json({ error: "다음 행동 형식이 올바르지 않다." }, { status: 400 });
  }
  if (status === undefined && nextAction === undefined) {
    return Response.json({ error: "바꿀 내용이 없다." }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const ok = await updateWorkItem({
      supabase,
      ownerId: owner.id,
      workItemId: id,
      status: status as WorkStatus | undefined,
      nextAction:
        nextAction === undefined
          ? undefined
          : typeof nextAction === "string" && nextAction.trim()
            ? nextAction.trim()
            : null,
    });
    if (!ok) return Response.json({ error: "일을 찾을 수 없다." }, { status: 404 });
    return Response.json({ id });
  } catch (error) {
    console.error("일 수정 실패:", error);
    return Response.json({ error: "요청을 처리하지 못했다." }, { status: 500 });
  }
}
