import type { SupabaseClient } from "@supabase/supabase-js";
import { generate } from "@/src/server/models/gateway";
import { MAX_INPUT_TOKENS } from "@/src/server/models/catalog";
import type { SendMessageInput } from "@/src/server/validation/chat";
import { SYSTEM_PROMPT, buildContext, type StoredMessage } from "./context";

export type SendMessageResult =
  | { ok: true; conversationId: string; answer: string; status: "completed"; deduped: boolean }
  | { ok: true; conversationId: string; answer: null; status: "failed"; reason: string; deduped: false }
  | { ok: false; code: "conflict" | "busy" | "not_found" | "retryable"; message: string };

/** PostgreSQL 유니크 제약 위반. 같은 client_request_id가 이미 있다는 뜻이다. */
const UNIQUE_VIOLATION = "23505";

/**
 * 메시지를 보내고 답변을 받는다.
 *
 * 순서는 문서 5절을 따른다.
 *   요청 검증(호출자) → 사용자 메시지 저장 → 최근 대화 구성
 *   → 답변 자리 예약 → 모델 호출 → 답변과 상태 저장
 *
 * 외부 API를 기다리는 동안 DB 트랜잭션을 잡지 않는다. Supabase REST는
 * 호출마다 독립이라 애초에 하나의 트랜잭션으로 묶이지도 않는다.
 */
export async function sendMessage(params: {
  supabase: SupabaseClient;
  ownerId: string;
  input: SendMessageInput;
}): Promise<SendMessageResult> {
  const { supabase, ownerId, input } = params;

  const conversationId = input.conversationId ?? (await createConversation(supabase, ownerId, input.content));
  if (!conversationId) {
    return { ok: false, code: "not_found", message: "대화를 찾을 수 없다." };
  }

  // 같은 대화에 진행 중인 생성이 있으면 거절한다. 답변이 뒤섞이는 것을 막는다.
  const pending = await findPending(supabase, conversationId);
  if (pending) {
    return { ok: false, code: "busy", message: "이 대화에 아직 진행 중인 답변이 있다." };
  }

  // 사용자 메시지를 저장한다. 유니크 인덱스가 중복을 막는다.
  const insert = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: input.content,
      status: "completed",
      client_request_id: input.clientRequestId,
    })
    .select("id")
    .single();

  if (insert.error) {
    if (insert.error.code !== UNIQUE_VIOLATION) throw insert.error;

    // 이미 처리한 요청이다. 같은 내용이면 저장된 답변을 그대로 돌려주고,
    // 내용이 다르면 같은 ID를 재사용한 것이므로 거절한다.
    return await handleDuplicate(supabase, conversationId, input);
  }

  // 답변 자리를 pending으로 먼저 만든다. 이 행이 생성 중임을 나타내는
  // 표시이자, 프로세스가 끊겼을 때 복구할 단서가 된다.
  const placeholder = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "assistant", content: "", status: "pending" })
    .select("id")
    .single();
  if (placeholder.error) throw placeholder.error;
  const answerId = placeholder.data.id as string;

  const recent = await loadRecent(supabase, conversationId, answerId);
  const { system, messages } = buildContext({
    system: SYSTEM_PROMPT,
    recent,
    current: input.content,
    maxInputTokens: MAX_INPUT_TOKENS,
  });

  const result = await generate({ supabase, ownerId, task: "chat", system, messages });

  if (!result.ok) {
    // 실패를 완료로 표시하지 않는다. 사용자 입력은 이미 저장되어 있으므로
    // 다시 입력할 필요는 없다.
    await supabase
      .from("messages")
      .update({ content: "", status: "failed" })
      .eq("id", answerId);
    return {
      ok: true,
      conversationId,
      answer: null,
      status: "failed",
      reason: result.message,
      deduped: false,
    };
  }

  const saved = await supabase
    .from("messages")
    .update({ content: result.text, status: "completed" })
    .eq("id", answerId);
  // 답변 저장에 실패했는데 성공으로 응답하면, 새로고침 시 답변이 사라진다.
  if (saved.error) throw saved.error;

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { ok: true, conversationId, answer: result.text, status: "completed", deduped: false };
}

async function createConversation(supabase: SupabaseClient, ownerId: string, firstMessage: string) {
  const title = firstMessage.slice(0, 40);
  const { data, error } = await supabase
    .from("conversations")
    .insert({ owner_id: ownerId, title })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function findPending(supabase: SupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * 이미 같은 client_request_id로 저장된 요청을 처리한다.
 *
 * 같은 내용이면 저장된 답변을 돌려준다. 재시도가 답변을 두 번 만들지
 * 않게 하기 위해서다. 내용이 다르면 거절한다. 문서 5절의 "같은 ID의
 * 다른 입력은 거절한다"를 따른다.
 */
async function handleDuplicate(
  supabase: SupabaseClient,
  conversationId: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, content, seq")
    .eq("conversation_id", conversationId)
    .eq("client_request_id", input.clientRequestId)
    .single();
  if (error) throw error;

  if (data.content !== input.content) {
    return {
      ok: false,
      code: "conflict",
      message: "같은 요청 ID로 다른 내용이 도착했다.",
    };
  }

  const answer = await supabase
    .from("messages")
    .select("content, status")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .gt("seq", data.seq)
    .order("seq", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (answer.error) throw answer.error;

  if (answer.data?.status === "completed") {
    return {
      ok: true,
      conversationId,
      answer: answer.data.content as string,
      status: "completed",
      deduped: true,
    };
  }

  // 답변이 실패로 끝난 요청이라면 같은 ID로 다시 시도할 수 있어야 한다.
  // 여기서 막으면 사용자는 실패한 대화를 복구할 방법이 없다.
  if (answer.data?.status === "failed") {
    return { ok: false, code: "retryable", message: "이전 답변이 실패했다. 다시 시도할 수 있다." };
  }

  return { ok: false, code: "busy", message: "같은 요청을 아직 처리하는 중이다." };
}

async function loadRecent(
  supabase: SupabaseClient,
  conversationId: string,
  excludeId: string,
): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, status")
    .eq("conversation_id", conversationId)
    .eq("status", "completed")
    .neq("id", excludeId)
    .order("seq", { ascending: true })
    .limit(40);
  if (error) throw error;

  // 방금 저장한 사용자 메시지는 buildContext가 current로 따로 넣으므로 뺀다.
  const rows = (data ?? []) as StoredMessage[];
  return rows.slice(0, -1);
}
