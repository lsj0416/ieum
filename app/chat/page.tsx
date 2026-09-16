import type { Metadata } from "next";
import { Placeholder, Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { signOut } from "@/app/login/actions";
import { MessageComposer } from "./message-composer";

export const metadata: Metadata = {
  title: "대화 · ieum",
};

export default async function ChatPage() {
  // proxy의 리다이렉트는 낙관적 검사일 뿐이다. 실제 판정은 여기서 한다.
  const owner = await requireOwner();

  return (
    <Screen title="대화" footer={<MessageComposer />}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs opacity-60">{owner.email}</span>
          <form action={signOut}>
            <button type="submit" className="shrink-0 text-xs underline underline-offset-4 opacity-70">
              로그아웃
            </button>
          </form>
        </div>

        <Placeholder>
          저장된 대화가 없다. 메시지 저장과 모델 호출은 S1에서 구현한다.
        </Placeholder>
      </div>
    </Screen>
  );
}
