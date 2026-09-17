import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listMemories } from "@/src/server/memory/service";
import { MemoryForm } from "./memory-form";
import { MemoryItem } from "./memory-item";

export const metadata: Metadata = {
  title: "기억함 · ieum",
};

export default async function MemoriesPage() {
  const owner = await requireOwner();
  const supabase = await createClient();
  const memories = await listMemories({ supabase, ownerId: owner.id });

  return (
    <Screen title="기억함" wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs opacity-60">
            비서가 기억할 내용을 직접 등록한다. 활성 기억 {memories.length}개.
          </p>
          <div className="flex shrink-0 gap-2 text-xs opacity-70">
            <Link href="/memories/import" className="underline underline-offset-4">
              가져오기
            </Link>
            <Link href="/chat" className="underline underline-offset-4">
              대화로
            </Link>
          </div>
        </div>

        <MemoryForm />

        {memories.length === 0 ? (
          <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
            등록된 기억이 없다. 위에서 추가하거나, 쓰던 AI에서{" "}
            <Link href="/memories/import" className="underline underline-offset-4">
              맥락을 가져온다
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memories.map((memory) => (
              <MemoryItem key={memory.id} memory={memory} />
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
