import type { SupabaseClient } from "@supabase/supabase-js";
import type { Topic, TopicDetail, TopicSegment } from "./types";

/** 목록에 보일 주제. 감춘 것과 후보는 빼고 최근 활동순으로 읽는다. */
export async function listTopics(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("topics")
    .select("id, title, source, status, version, last_activity_at")
    .eq("owner_id", ownerId)
    .eq("status", "ACTIVE")
    .order("last_activity_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  return (data ?? []).map(toTopic);
}

function toTopic(row: Record<string, unknown>): Topic {
  return {
    id: row.id as string,
    title: row.title as string,
    source: row.source as Topic["source"],
    status: row.status as Topic["status"],
    version: row.version as number,
    lastActivityAt: row.last_activity_at as string,
  };
}

/** PostgreSQL 유니크 제약 위반. 같은 이름의 주제가 이미 있다는 뜻이다. */
const UNIQUE_VIOLATION = "23505";

export type CreateTopicResult =
  | { ok: true; id: string }
  | { ok: false; code: "duplicate"; message: string };

export async function createTopic(params: {
  supabase: SupabaseClient;
  ownerId: string;
  title: string;
}): Promise<CreateTopicResult> {
  const { supabase, ownerId, title } = params;
  const { data, error } = await supabase
    .from("topics")
    .insert({ owner_id: ownerId, title, source: "MANUAL", status: "ACTIVE" })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, code: "duplicate", message: "같은 이름의 주제가 이미 있다." };
    }
    throw error;
  }
  return { ok: true, id: data.id as string };
}

export async function renameTopic(params: {
  supabase: SupabaseClient;
  ownerId: string;
  topicId: string;
  title: string;
}): Promise<CreateTopicResult | { ok: false; code: "not_found"; message: string }> {
  const { supabase, ownerId, topicId, title } = params;
  const { data, error } = await supabase
    .from("topics")
    .update({ title })
    .eq("id", topicId)
    .eq("owner_id", ownerId)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, code: "duplicate", message: "같은 이름의 주제가 이미 있다." };
    }
    throw error;
  }
  if ((data ?? []).length === 0) {
    return { ok: false, code: "not_found", message: "주제를 찾을 수 없다." };
  }
  // 이름을 바꿔도 Topic ID는 유지한다(05 4.3절). 연결된 구간이 끊기지 않는다.
  return { ok: true, id: topicId };
}

/** 주제를 감춘다. 삭제가 아니다. 연결된 구간과 원문은 그대로 남는다. */
export async function archiveTopic(params: {
  supabase: SupabaseClient;
  ownerId: string;
  topicId: string;
}): Promise<boolean> {
  const { supabase, ownerId, topicId } = params;
  const { data, error } = await supabase
    .from("topics")
    .update({ status: "ARCHIVED", hidden_at: new Date().toISOString() })
    .eq("id", topicId)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export type LinkResult =
  | { ok: true; segmentId: string }
  | { ok: false; code: "not_found" | "invalid_range"; message: string };

/**
 * 대화의 한 구간을 주제에 연결한다.
 *
 * 구간을 먼저 만들고 연결을 붙인다. 같은 구간을 다시 연결하면 기존 행을
 * 다시 쓴다. 원문은 건드리지 않는다. 주제에 붙인다고 메시지가 옮겨가지
 * 않는다(D44).
 */
export async function linkSegment(params: {
  supabase: SupabaseClient;
  ownerId: string;
  topicId: string;
  conversationId: string;
  startSeq: number;
  endSeq: number;
}): Promise<LinkResult> {
  const { supabase, ownerId, topicId, conversationId, startSeq, endSeq } = params;

  if (startSeq > endSeq) {
    return { ok: false, code: "invalid_range", message: "구간의 시작이 끝보다 뒤다." };
  }

  // 주제와 대화가 모두 내 것인지 확인한다. RLS도 막지만, 여기서 걸러야
  // 없는 것과 남의 것을 같은 응답으로 다룰 수 있다.
  const topic = await supabase
    .from("topics")
    .select("id")
    .eq("id", topicId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (topic.error) throw topic.error;
  if (!topic.data) return { ok: false, code: "not_found", message: "주제를 찾을 수 없다." };

  // seq는 전역 시퀀스다. 범위를 읽을 때 반드시 conversation_id를 함께 건다.
  const messages = await supabase
    .from("messages")
    .select("seq")
    .eq("conversation_id", conversationId)
    .gte("seq", startSeq)
    .lte("seq", endSeq);
  if (messages.error) throw messages.error;
  if ((messages.data ?? []).length === 0) {
    return { ok: false, code: "not_found", message: "그 구간에 해당하는 메시지가 없다." };
  }

  const segment = await supabase
    .from("conversation_segments")
    .insert({ conversation_id: conversationId, start_seq: startSeq, end_seq: endSeq })
    .select("id")
    .single();
  if (segment.error) throw segment.error;
  const segmentId = segment.data.id as string;

  const link = await supabase
    .from("topic_segments")
    .upsert(
      { topic_id: topicId, segment_id: segmentId, source: "MANUAL", decision: "INCLUDE" },
      { onConflict: "topic_id,segment_id" },
    );
  if (link.error) {
    // 연결이 실패하면 구간만 떠돌게 두지 않는다.
    await supabase.from("conversation_segments").delete().eq("id", segmentId);
    throw link.error;
  }

  await supabase
    .from("topics")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", topicId);

  return { ok: true, segmentId };
}

/**
 * 연결을 해제한다.
 *
 * 지우지 않고 EXCLUDE로 남긴다. 나중에 자동 분류가 같은 구간을 다시
 * 붙이지 못하게 하는 기록이다(05 4.3절).
 */
export async function unlinkSegment(params: {
  supabase: SupabaseClient;
  ownerId: string;
  topicId: string;
  segmentId: string;
  reason?: string;
}): Promise<boolean> {
  const { supabase, ownerId, topicId, segmentId, reason } = params;

  const topic = await supabase
    .from("topics")
    .select("id")
    .eq("id", topicId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (topic.error) throw topic.error;
  if (!topic.data) return false;

  const { data, error } = await supabase
    .from("topic_segments")
    .update({ decision: "EXCLUDE", reason: reason ?? "사용자가 연결을 해제했다" })
    .eq("topic_id", topicId)
    .eq("segment_id", segmentId)
    .select("segment_id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** 주제 상세. 연결된 구간과 근거 대화를 함께 읽는다. */
export async function getTopicDetail(params: {
  supabase: SupabaseClient;
  ownerId: string;
  topicId: string;
}): Promise<TopicDetail | null> {
  const { supabase, ownerId, topicId } = params;

  const topic = await supabase
    .from("topics")
    .select("id, title, source, status, version, last_activity_at")
    .eq("id", topicId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (topic.error) throw topic.error;
  if (!topic.data) return null;

  const links = await supabase
    .from("topic_segments")
    .select(
      "segment_id, decision, source, " +
        "conversation_segments (id, conversation_id, start_seq, end_seq, conversations (title))",
    )
    .eq("topic_id", topicId)
    .eq("decision", "INCLUDE");
  if (links.error) throw links.error;

  const rows = (links.data ?? []) as unknown as Record<string, unknown>[];
  const segments: TopicSegment[] = [];

  for (const row of rows) {
    const seg = row.conversation_segments as Record<string, unknown> | null;
    if (!seg) continue;

    // 구간의 첫 메시지를 미리보기로 쓴다. 원문을 통째로 복사하지 않는다.
    const preview = await supabase
      .from("messages")
      .select("content")
      .eq("conversation_id", seg.conversation_id as string)
      .gte("seq", seg.start_seq as number)
      .order("seq", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (preview.error) throw preview.error;

    const conversation = seg.conversations as Record<string, unknown> | null;
    segments.push({
      segmentId: seg.id as string,
      conversationId: seg.conversation_id as string,
      conversationTitle: (conversation?.title as string | null) ?? null,
      startSeq: seg.start_seq as number,
      endSeq: seg.end_seq as number,
      decision: row.decision as "INCLUDE" | "EXCLUDE",
      source: row.source as "MANUAL" | "AUTO",
      preview: ((preview.data?.content as string | undefined) ?? "").slice(0, 80),
    });
  }

  // 가장 최근에 연결된 대화를 '이 주제로 대화'의 기본값으로 제안한다.
  const lastConversationId = segments.length > 0 ? segments[segments.length - 1].conversationId : null;

  return { ...toTopic(topic.data), segments, lastConversationId };
}
