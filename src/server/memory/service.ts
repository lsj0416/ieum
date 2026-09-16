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
      "id, kind, content, source, status, supersedes_id, valid_from, valid_until, updated_at, version, " +
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
    version: row.version as number,
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

export type UpdateResult =
  | { ok: true; id: string; version: number }
  | { ok: false; code: "conflict" | "not_found" | "gone"; message: string };

/**
 * 기억을 정정한다.
 *
 * 값을 덮어쓰지 않는다. 이전 버전을 SUPERSEDED로 닫고 새 행을 만들어
 * supersedes_id로 잇는다. 과거 질문에 답할 때 "그때는 무엇이 사실이었는지"를
 * 볼 수 있어야 하기 때문이다.
 *
 * 고치려는 쪽이 본 버전과 지금 버전이 다르면 거절한다. 그 사이에 다른
 * 곳에서 고쳤다는 뜻이고, 그대로 진행하면 남의 수정이 조용히 사라진다.
 */
export async function reviseMemory(params: {
  supabase: SupabaseClient;
  ownerId: string;
  memoryId: string;
  expectedVersion: number;
  content: string;
  kind: MemoryWithEvidence["kind"];
  quote: string;
}): Promise<UpdateResult> {
  const { supabase, ownerId, memoryId, expectedVersion, content, kind, quote } = params;

  const current = await supabase
    .from("memories")
    .select("id, version, status")
    .eq("id", memoryId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) {
    return { ok: false, code: "not_found", message: "기억을 찾을 수 없다." };
  }
  if (current.data.status !== "ACTIVE") {
    return { ok: false, code: "gone", message: "이미 닫히거나 지워진 기억이다." };
  }
  if (current.data.version !== expectedVersion) {
    return {
      ok: false,
      code: "conflict",
      message: "다른 곳에서 먼저 수정했다. 최신 내용을 확인한 뒤 다시 고친다.",
    };
  }

  // 새 버전을 먼저 만든다. 이전 버전을 먼저 닫으면, 새 행 생성이 실패했을 때
  // 활성 기억이 하나도 없는 상태가 남는다.
  const created = await supabase
    .from("memories")
    .insert({
      owner_id: ownerId,
      kind,
      content,
      source: "USER",
      supersedes_id: memoryId,
    })
    .select("id, version")
    .single();
  if (created.error) throw created.error;

  const evidence = await supabase.from("memory_evidence").insert({
    memory_id: created.data.id,
    quote,
    source_kind: "MANUAL",
  });
  if (evidence.error) {
    await supabase.from("memories").delete().eq("id", created.data.id);
    throw evidence.error;
  }

  // 여기서 버전을 다시 확인한다. 위 검사와 이 사이에 누가 고쳤다면
  // 조건에 걸려 0건이 갱신되고, 그때는 새로 만든 행을 되돌린다.
  const closed = await supabase
    .from("memories")
    .update({ status: "SUPERSEDED" })
    .eq("id", memoryId)
    .eq("version", expectedVersion)
    .select("id");
  if (closed.error) throw closed.error;

  if ((closed.data ?? []).length === 0) {
    await supabase.from("memories").delete().eq("id", created.data.id);
    return {
      ok: false,
      code: "conflict",
      message: "다른 곳에서 먼저 수정했다. 최신 내용을 확인한 뒤 다시 고친다.",
    };
  }

  return { ok: true, id: created.data.id as string, version: created.data.version as number };
}

/**
 * 기억을 지운다.
 *
 * 두 가지를 구분한다. 문서 7절이 요구하는 구분이다.
 *
 * forget: 기억만 닫는다. 출처가 된 대화는 그대로 두므로, 모델이 최근
 *   대화를 읽다가 같은 이야기를 다시 할 수 있다.
 *
 * with_source: 출처 메시지를 Context에서도 제외한다. 대화 기록에는 남지만
 *   모델에게 더는 전달되지 않는다. 지운 사실이 다시 살아나지 않게 하려면
 *   이쪽이어야 한다.
 */
export async function deleteMemory(params: {
  supabase: SupabaseClient;
  ownerId: string;
  memoryId: string;
  mode: "forget" | "with_source";
}): Promise<UpdateResult> {
  const { supabase, ownerId, memoryId, mode } = params;

  const closed = await supabase
    .from("memories")
    .update({ status: "DELETED" })
    .eq("id", memoryId)
    .eq("owner_id", ownerId)
    .select("id, version");
  if (closed.error) throw closed.error;
  if ((closed.data ?? []).length === 0) {
    return { ok: false, code: "not_found", message: "기억을 찾을 수 없다." };
  }

  if (mode === "with_source") {
    const evidence = await supabase
      .from("memory_evidence")
      .select("source_message_id")
      .eq("memory_id", memoryId);
    if (evidence.error) throw evidence.error;

    const messageIds = (evidence.data ?? [])
      .map((e) => e.source_message_id as string | null)
      .filter((id): id is string => id !== null);

    if (messageIds.length > 0) {
      const excluded = await supabase
        .from("messages")
        .update({ excluded_from_context: true })
        .in("id", messageIds);
      // 기억은 이미 닫혔다. 제외 표시 실패를 성공으로 알리지 않는다.
      if (excluded.error) throw excluded.error;
    }
  }

  return { ok: true, id: memoryId, version: closed.data[0].version as number };
}
