import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkItem, WorkItemDetail, WorkStatus } from "./types";

const SELECT = "id, title, goal, status, next_action, topic_id, last_confirmed_at, updated_at, topics (title)";

function toWorkItem(row: Record<string, unknown>): WorkItem {
  const topic = row.topics as Record<string, unknown> | null;
  return {
    id: row.id as string,
    title: row.title as string,
    goal: (row.goal as string | null) ?? null,
    status: row.status as WorkStatus,
    nextAction: (row.next_action as string | null) ?? null,
    topicId: (row.topic_id as string | null) ?? null,
    topicTitle: (topic?.title as string | null) ?? null,
    lastConfirmedAt: row.last_confirmed_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 일 목록.
 *
 * 기본은 진행 중과 보류만 본다. 완료한 일은 따로 청해야 나온다. 완료한
 * 일을 계속 보여주면 다시 권하게 된다(E03).
 */
export async function listWorkItems(params: {
  supabase: SupabaseClient;
  ownerId: string;
  includeDone?: boolean;
}): Promise<WorkItem[]> {
  const { supabase, ownerId, includeDone = false } = params;

  let query = supabase
    .from("work_items")
    .select(SELECT)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!includeDone) query = query.neq("status", "DONE");

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toWorkItem);
}

export async function createWorkItem(params: {
  supabase: SupabaseClient;
  ownerId: string;
  title: string;
  goal: string | null;
  nextAction: string | null;
  topicId: string | null;
}): Promise<{ id: string }> {
  const { supabase, ownerId, title, goal, nextAction, topicId } = params;
  const { data, error } = await supabase
    .from("work_items")
    .insert({
      owner_id: ownerId,
      title,
      goal,
      next_action: nextAction,
      topic_id: topicId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

/**
 * 일의 상태와 다음 행동을 고친다.
 *
 * 상태를 바꿀 때마다 last_confirmed_at을 갱신한다. 이 값이 오래되면
 * 화면과 Context가 "마지막 확인 시점"을 밝힌다(E09).
 */
export async function updateWorkItem(params: {
  supabase: SupabaseClient;
  ownerId: string;
  workItemId: string;
  status?: WorkStatus;
  nextAction?: string | null;
}): Promise<boolean> {
  const { supabase, ownerId, workItemId, status, nextAction } = params;

  const patch: Record<string, unknown> = { last_confirmed_at: new Date().toISOString() };
  if (status !== undefined) {
    patch.status = status;
    // 완료로 바꾸면 다음 행동을 비운다. 끝난 일에 다음 행동이 남아 있으면
    // 모델이 그것을 계속 권한다(E03).
    if (status === "DONE") {
      patch.completed_at = new Date().toISOString();
      patch.next_action = null;
    } else {
      patch.completed_at = null;
    }
  }
  if (nextAction !== undefined && patch.next_action === undefined) {
    patch.next_action = nextAction;
  }

  const { data, error } = await supabase
    .from("work_items")
    .update(patch)
    .eq("id", workItemId)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * 결정을 기록한다.
 *
 * 이전 결정을 대체하면 그것을 SUPERSEDED로 닫고 새 결정을 잇는다.
 * 덮어쓰지 않는 이유는 기억과 같다. 지난 결정을 지우면 왜 그렇게 정했는지
 * 되짚을 수 없다(D33).
 */
export async function addDecision(params: {
  supabase: SupabaseClient;
  ownerId: string;
  workItemId: string;
  decision: string;
  reason: string | null;
  supersedesId: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { supabase, ownerId, workItemId, decision, reason, supersedesId } = params;

  const owned = await supabase
    .from("work_items")
    .select("id")
    .eq("id", workItemId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (owned.error) throw owned.error;
  if (!owned.data) return { ok: false, message: "일을 찾을 수 없다." };

  const created = await supabase
    .from("work_decisions")
    .insert({ work_item_id: workItemId, decision, reason, supersedes_id: supersedesId })
    .select("id")
    .single();
  if (created.error) throw created.error;

  if (supersedesId) {
    const closed = await supabase
      .from("work_decisions")
      .update({ status: "SUPERSEDED" })
      .eq("id", supersedesId)
      .eq("work_item_id", workItemId);
    if (closed.error) {
      await supabase.from("work_decisions").delete().eq("id", created.data.id);
      throw closed.error;
    }
  }

  await supabase
    .from("work_items")
    .update({ last_confirmed_at: new Date().toISOString() })
    .eq("id", workItemId);

  return { ok: true, id: created.data.id as string };
}

export async function getWorkItemDetail(params: {
  supabase: SupabaseClient;
  ownerId: string;
  workItemId: string;
}): Promise<WorkItemDetail | null> {
  const { supabase, ownerId, workItemId } = params;

  const item = await supabase
    .from("work_items")
    .select(SELECT)
    .eq("id", workItemId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (item.error) throw item.error;
  if (!item.data) return null;

  const decisions = await supabase
    .from("work_decisions")
    .select("id, decision, reason, status, created_at")
    .eq("work_item_id", workItemId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (decisions.error) throw decisions.error;

  return {
    ...toWorkItem(item.data as unknown as Record<string, unknown>),
    decisions: (decisions.data ?? []).map((row) => ({
      id: row.id as string,
      decision: row.decision as string,
      reason: (row.reason as string | null) ?? null,
      status: row.status as "ACTIVE" | "SUPERSEDED",
      createdAt: row.created_at as string,
    })),
  };
}

export type WorkContextItem = {
  id: string;
  title: string;
  status: WorkStatus;
  nextAction: string | null;
  lastDecision: string | null;
  lastConfirmedAt: string;
};

/**
 * Context에 넣을 진행 중인 일.
 *
 * 완료한 일은 넣지 않는다. 넣으면 모델이 끝난 일을 다시 권한다(E03).
 * 각 일의 마지막 결정을 함께 읽어 "마지막 결정과 다음 행동"을 답할 수
 * 있게 한다.
 */
export async function activeWorkForContext(params: {
  supabase: SupabaseClient;
  ownerId: string;
  limit?: number;
}): Promise<WorkContextItem[]> {
  const { supabase, ownerId, limit = 5 } = params;

  const { data, error } = await supabase
    .from("work_items")
    .select("id, title, status, next_action, last_confirmed_at, work_decisions (decision, status, created_at)")
    .eq("owner_id", ownerId)
    .neq("status", "DONE")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const decisions = (row.work_decisions ?? []) as Record<string, unknown>[];
    // 대체되지 않은 결정 중 가장 최근 것. SUPERSEDED는 지난 결정이다.
    const active = decisions
      .filter((d) => d.status === "ACTIVE")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    return {
      id: row.id as string,
      title: row.title as string,
      status: row.status as WorkStatus,
      nextAction: (row.next_action as string | null) ?? null,
      lastDecision: (active[0]?.decision as string | undefined) ?? null,
      lastConfirmedAt: row.last_confirmed_at as string,
    };
  });
}
