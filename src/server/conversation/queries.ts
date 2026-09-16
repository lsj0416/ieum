import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatMessage = {
  id: string;
  /**
   * 대화 안의 순서. 구간을 주제에 연결할 때 쓴다.
   *
   * 화면에서 방금 만든 메시지에는 없다. 서버가 저장한 뒤에야 정해지는
   * 값이므로 클라이언트가 지어내지 않는다.
   */
  seq?: number;
  role: "user" | "assistant" | "system";
  content: string;
  status: "pending" | "completed" | "failed" | "partial";
  /**
   * partial로 끝난 이유. 이번 요청에서 막 생긴 답변에만 있다.
   * DB에는 저장하지 않는다. 다시 읽으면 "도중에 끊겼다"로만 보인다.
   */
  partialReason?: string;
  /**
   * 이번 답변에 전달한 기억. 막 생긴 답변에만 있다.
   * DB에는 저장하지 않으므로 새로고침하면 사라진다.
   */
  usedMemories?: { id: string; kind: string; content: string }[];
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  titleSource: "AUTO" | "USER";
  updatedAt: string;
};

/**
 * 보관하지 않은 대화 목록. 최근 갱신순.
 */
export async function listConversations(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, title_source, updated_at")
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string | null) ?? null,
    titleSource: row.title_source as "AUTO" | "USER",
    updatedAt: row.updated_at as string,
  }));
}

/**
 * 이 대화가 내 것이고 살아 있는지 확인한다.
 *
 * 주소로 직접 들어오는 경로가 생겼으므로 소유권을 확인해야 한다. RLS가
 * 이미 막지만, 없는 대화와 남의 대화를 같은 방식으로 다뤄 존재 여부가
 * 새지 않게 한다.
 */
export async function conversationExists(
  supabase: SupabaseClient,
  ownerId: string,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * 가장 최근에 갱신된 대화. 없으면 null.
 *
 * 마지막으로 열어본 대화가 없거나 유효하지 않을 때의 기본값이다.
 */
export async function latestConversationId(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/**
 * 대화의 메시지를 순서대로 읽는다.
 *
 * RLS가 소유권을 확인하므로 여기서 owner_id를 다시 걸지 않는다. 다만
 * 이것은 클라이언트가 아니라 서버가 사용자 토큰으로 읽을 때의 이야기다.
 */
export async function listMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, seq, role, content, status")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}
