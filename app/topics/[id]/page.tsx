import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getTopicDetail } from "@/src/server/topic/service";
import { TopicSegments } from "./topic-segments";

export const metadata: Metadata = {
  title: "주제 · ieum",
};

export default async function TopicDetailPage({ params }: PageProps<"/topics/[id]">) {
  const owner = await requireOwner();
  const { id } = await params;
  const supabase = await createClient();

  // 남의 주제와 없는 주제를 같은 404로 다룬다.
  const topic = await getTopicDetail({ supabase, ownerId: owner.id, topicId: id });
  if (!topic) notFound();

  return (
    <Screen title={topic.title} wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-2 text-xs opacity-60">
          <span>
            {topic.source === "AUTO" ? "자동 발견" : "직접 만든 주제"} · 근거 구간 {topic.segments.length}개
          </span>
          <Link href="/topics" className="shrink-0 underline underline-offset-4">
            주제 목록
          </Link>
        </div>

        {/*
          '이 주제로 대화'는 마지막으로 쓴 대화를 제안하되 새 대화도 준다.
          서로 다른 원문 대화를 이어 붙여 하나처럼 보이게 하지 않는다(05 4.2절).
        */}
        <div className="flex flex-wrap gap-2">
          {topic.lastConversationId ? (
            <Link
              href={`/chat/${topic.lastConversationId}`}
              className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
            >
              이 주제로 대화 (이어서)
            </Link>
          ) : null}
          <Link
            href="/chat/new"
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
          >
            새 대화로 시작
          </Link>
        </div>

        {/*
          요약과 진행 중인 일은 아직 없다. 없는 것을 모델이 채워 넣지 않게
          자리를 비워 둔다(05 4.2절). 요약은 S4-A, 작업은 S3-C다.
        */}
        <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
          주제 요약과 연결된 일은 아직 만들지 않았다. 지금은 근거 대화만 모은다.
        </p>

        <TopicSegments topicId={topic.id} segments={topic.segments} />
      </div>
    </Screen>
  );
}
