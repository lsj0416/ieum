import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "pending" | "completed" | "failed" | "partial";
};

/**
 * 가장 최근에 갱신된 대화. 없으면 null.
 *
 * 지금은 한 번에 하나의 대화만 보여준다. 대화 목록과 전환은 여러 작업을
 * 다루는 S3에서 필요해진다. 그 전에 미리 만들지 않는다.
 */
export async function latestConversationId(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("owner_id", ownerId)
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
    .select("id, role, content, status")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}
