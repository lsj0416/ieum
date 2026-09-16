import Link from "next/link";
import { Screen } from "@/app/ui/screen";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { listConversations, listMessages } from "@/src/server/conversation/queries";
import { ChatView } from "./chat-view";
import { ConversationList } from "./conversation-list";
import { RememberSelection } from "./remember-selection";

/**
 * 대화 화면. /chat과 /chat/[id]가 같은 화면을 쓴다.
 *
 * conversationId가 null이면 아직 저장되지 않은 새 대화다. 첫 메시지를
 * 보낼 때 서버가 만든다. 빈 대화를 미리 만들면 목록에 빈 줄이 쌓인다.
 */
export async function ConversationScreen({
  ownerEmail,
  ownerId,
  conversationId,
}: {
  ownerEmail: string;
  ownerId: string;
  conversationId: string | null;
}) {
  const supabase = await createClient();
  const [conversations, messages] = await Promise.all([
    listConversations(supabase, ownerId),
    conversationId ? listMessages(supabase, conversationId) : Promise.resolve([]),
  ]);

  return (
    <Screen title="대화" wide>
      <div className="flex items-center justify-between gap-2 pb-3">
        <span className="truncate text-xs opacity-60">{ownerEmail}</span>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/memories" className="text-xs underline underline-offset-4 opacity-70">
            기억함
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-xs underline underline-offset-4 opacity-70">
              로그아웃
            </button>
          </form>
        </div>
      </div>

      <RememberSelection conversationId={conversationId} />

      <ConversationList conversations={conversations} currentId={conversationId} />

      <ChatView
        // 대화를 바꾸면 화면 상태를 처음부터 다시 만든다. key가 없으면
        // 이전 대화의 메시지와 진행 중 상태가 남는다.
        key={conversationId ?? "new"}
        initialMessages={messages}
        initialConversationId={conversationId}
      />
    </Screen>
  );
}
