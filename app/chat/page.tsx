import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { conversationExists, latestConversationId } from "@/src/server/conversation/queries";
import { ConversationScreen } from "./conversation-screen";
import { LAST_CONVERSATION_COOKIE } from "./last-conversation-cookie";

export const metadata: Metadata = {
  title: "대화 · ieum",
};

export default async function ChatPage() {
  const owner = await requireOwner();
  const supabase = await createClient();

  // 마지막으로 열었던 대화를 복원한다. 쿠키 값은 사용자가 고칠 수 있으므로
  // 소유권과 생존을 서버가 다시 확인한다. 유효하지 않으면 최근 대화로 간다.
  const remembered = (await cookies()).get(LAST_CONVERSATION_COOKIE)?.value ?? null;
  const restored =
    remembered && (await conversationExists(supabase, owner.id, remembered)) ? remembered : null;

  const conversationId = restored ?? (await latestConversationId(supabase, owner.id));

  return (
    <ConversationScreen ownerEmail={owner.email} ownerId={owner.id} conversationId={conversationId} />
  );
}
