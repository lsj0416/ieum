import type { Metadata } from "next";
import { requireOwner } from "@/lib/supabase/auth";
import { ConversationScreen } from "../conversation-screen";

export const metadata: Metadata = {
  title: "새 대화 · ieum",
};

/**
 * 새 대화. 아직 DB에 만들지 않는다.
 *
 * 첫 메시지를 보낼 때 서버가 만든다. 미리 만들면 말 한마디 없이 닫은
 * 빈 대화가 목록에 쌓인다(05 4.1절).
 */
export default async function NewConversationPage() {
  const owner = await requireOwner();
  return <ConversationScreen ownerEmail={owner.email} ownerId={owner.id} conversationId={null} />;
}
