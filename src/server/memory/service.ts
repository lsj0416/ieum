import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateMemoryInput } from "@/src/server/validation/memory";
import type { MemoryWithEvidence } from "./types";

/**
 * 기억을 등록한다.
 *
 * 기억과 근거를 함께 만든다. 근거 없는 기억은 만들지 않는다. 나중에
 * "왜 이걸 알고 있지"를 답할 수 없기 때문이다.
 *
 * Supabase REST는 호출마다 독립이라 두 insert가 하나의 트랜잭션이 되지
 * 않는다. 근거 저장이 실패하면 기억도 지워 어중간한 상태를 남기지 않는다.
 */
export async function createMemory(params: {
  supabase: SupabaseClient;
  ownerId: string;
  input: CreateMemoryInput;
}): Promise<{ id: string }> {
  const { supabase, ownerId, input } = params;

  const memory = await supabase
    .from("memories")
    .insert({
      owner_id: ownerId,
      kind: input.kind,
      content: input.content,
      source: "USER",
    })
    .select("id")
    .single();
  if (memory.error) throw memory.error;

  const memoryId = memory.data.id as string;

  const evidence = await supabase.from("memory_evidence").insert({
    memory_id: memoryId,
    source_message_id: input.sourceMessageId,
    quote: input.quote,
    source_kind: input.sourceMessageId ? "CHAT" : "MANUAL",
  });

  if (evidence.error) {
    // 근거 없는 기억을 남기느니 되돌린다. 이 삭제가 또 실패하면 로그로 남긴다.
    const rollback = await supabase.from("memories").delete().eq("id", memoryId);
    if (rollback.error) {
      console.error("근거 저장 실패 후 기억 되돌리기도 실패:", rollback.error.message, memoryId);
    }
    throw evidence.error;
  }

  return { id: memoryId };
}

/**
 * 기억 목록. 기본은 활성 기억만 본다.
 *
 * 삭제한 기억도 보여줄 수 있어야 한다. 사용자가 무엇을 지웠는지 확인하고
 * 되살릴 수 있어야 하기 때문이다. 다만 기본 화면에서는 보이지 않는다.
 */
export async function listMemories(params: {
  supabase: SupabaseClient;
  ownerId: string;
  includeInactive?: boolean;
}): Promise<MemoryWithEvidence[]> {
  const { supabase, ownerId, includeInactive = false } = params;

  let query = supabase
    .from("memories")
    .select(
      "id, kind, content, source, status, supersedes_id, valid_from, valid_until, updated_at, " +
        "memory_evidence (id, quote, source_kind, source_message_id)",
    )
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (!includeInactive) query = query.eq("status", "ACTIVE");

  const { data, error } = await query;
  if (error) throw error;

  // 중첩 select의 반환 타입을 Supabase 클라이언트가 추론하지 못한다.
  // 생성된 DB 타입을 도입하기 전까지는 여기서 모양을 명시한다.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    kind: row.kind as MemoryWithEvidence["kind"],
    content: row.content as string,
    source: row.source as MemoryWithEvidence["source"],
    status: row.status as MemoryWithEvidence["status"],
    supersedesId: (row.supersedes_id as string | null) ?? null,
    validFrom: row.valid_from as string,
    validUntil: (row.valid_until as string | null) ?? null,
    updatedAt: row.updated_at as string,
    evidence: ((row.memory_evidence ?? []) as Record<string, unknown>[]).map((e) => ({
      id: e.id as string,
      quote: e.quote as string,
      sourceKind: e.source_kind as "CHAT" | "MANUAL",
      sourceMessageId: (e.source_message_id as string | null) ?? null,
    })),
  }));
}
