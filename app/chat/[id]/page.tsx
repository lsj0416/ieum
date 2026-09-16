import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { conversationExists } from "@/src/server/conversation/queries";
import { ConversationScreen } from "../conversation-screen";

export const metadata: Metadata = {
  title: "대화 · ieum",
};

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const owner = await requireOwner();
  const { id } = await params;
  const supabase = await createClient();

  // 남의 대화와 없는 대화를 같은 404로 다룬다. 존재 여부를 흘리지 않는다.
  if (!(await conversationExists(supabase, owner.id, id))) {
    notFound();
  }

  return <ConversationScreen ownerEmail={owner.email} ownerId={owner.id} conversationId={id} />;
}
