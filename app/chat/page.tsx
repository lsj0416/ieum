import type { Metadata } from "next";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { latestConversationId, listMessages } from "@/src/server/conversation/queries";
import { ChatView } from "./chat-view";

export const metadata: Metadata = {
  title: "대화 · ieum",
};

export default async function ChatPage() {
  // proxy의 리다이렉트는 낙관적 검사일 뿐이다. 실제 판정은 여기서 한다.
  const owner = await requireOwner();
  const supabase = await createClient();

  // 새로고침해도 이어지도록 저장된 대화를 서버에서 읽어 내려보낸다.
  const conversationId = await latestConversationId(supabase, owner.id);
  const messages = conversationId ? await listMessages(supabase, conversationId) : [];

  return (
    <Screen title="대화" wide>
      <div className="flex items-center justify-between gap-2 pb-3">
        <span className="truncate text-xs opacity-60">{owner.email}</span>
        <form action={signOut}>
          <button type="submit" className="shrink-0 text-xs underline underline-offset-4 opacity-70">
            로그아웃
          </button>
        </form>
      </div>

      <ChatView initialMessages={messages} initialConversationId={conversationId} />
    </Screen>
  );
}
