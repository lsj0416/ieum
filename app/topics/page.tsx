import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listTopics } from "@/src/server/topic/service";
import { TopicForm } from "./topic-form";

export const metadata: Metadata = {
  title: "주제 · ieum",
};

export default async function TopicsPage() {
  const owner = await requireOwner();
  const supabase = await createClient();
  const topics = await listTopics(supabase, owner.id);

  return (
    <Screen title="주제" wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs opacity-60">
            여러 대화에 흩어진 이야기를 주제로 모은다. 활성 주제 {topics.length}개.
          </p>
          <Link href="/chat" className="shrink-0 text-xs underline underline-offset-4 opacity-70">
            대화로
          </Link>
        </div>

        <TopicForm />

        {topics.length === 0 ? (
          <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
            등록된 주제가 없다. 위에서 추가한다. 자동 발견은 나중 단계다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topics.map((topic) => (
              <li key={topic.id} className="rounded-md border border-black/10 p-3 dark:border-white/15">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/topics/${topic.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {topic.title}
                  </Link>
                  <span className="shrink-0 text-xs opacity-50">
                    {topic.source === "AUTO" ? "자동" : "직접"}
                  </span>
                </div>
                <p className="pt-1 text-xs opacity-50">
                  마지막 활동 {new Date(topic.lastActivityAt).toLocaleDateString("ko-KR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
