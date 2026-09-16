import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listMemories } from "@/src/server/memory/service";
import { KIND_LABELS } from "@/src/server/memory/types";
import { MemoryForm } from "./memory-form";

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
          <Link href="/chat" className="shrink-0 text-xs underline underline-offset-4 opacity-70">
            대화로
          </Link>
        </div>

        <MemoryForm />

        {memories.length === 0 ? (
          <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
            등록된 기억이 없다. 위에서 추가한다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="rounded-md border border-black/10 p-3 dark:border-white/15"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded border border-black/15 px-1.5 py-0.5 text-xs opacity-70 dark:border-white/20">
                    {KIND_LABELS[memory.kind]}
                  </span>
                  <span className="text-xs opacity-50">
                    {new Date(memory.updatedAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                <p className="whitespace-pre-wrap break-words pt-2 text-sm">{memory.content}</p>

                {/* 근거를 접어둔다. 평소에는 방해되지만 확인할 수 있어야 한다. */}
                {memory.evidence.length > 0 ? (
                  <details className="pt-2">
                    <summary className="cursor-pointer text-xs opacity-60">근거 보기</summary>
                    <ul className="flex flex-col gap-1 pt-1">
                      {memory.evidence.map((e) => (
                        <li
                          key={e.id}
                          className="whitespace-pre-wrap break-words border-l-2 border-current/20 pl-2 text-xs opacity-70"
                        >
                          {e.quote}
                          <span className="pl-1 opacity-60">
                            ({e.sourceKind === "CHAT" ? "대화에서" : "직접 입력"})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
