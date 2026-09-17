import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listImports } from "@/src/server/memory/import-service";
import { PromptBlock } from "./prompt-block";
import { ImportForm } from "./import-form";

export const metadata: Metadata = {
  title: "맥락 가져오기 · ieum",
};

export default async function ImportPage() {
  const owner = await requireOwner();
  const supabase = await createClient();
  const imports = await listImports({ supabase, ownerId: owner.id });

  return (
    <Screen title="맥락 가져오기" wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs opacity-60">
            쓰던 AI에게 자기 정보를 정리하게 해서 옮겨 온다. 가져온 내용은 확정된 사실이 아니라
            기억 후보이며, 고른 것만 저장된다.
          </p>
          <Link href="/memories" className="shrink-0 text-xs underline underline-offset-4 opacity-70">
            기억함
          </Link>
        </div>

        <PromptBlock />
        <ImportForm />

        {imports.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm">지난 가져오기</h2>
            <ul className="flex flex-col gap-2">
              {imports.map((item) => (
                <li key={item.id} className="rounded-md border border-black/10 p-3 dark:border-white/15">
                  <Link href={`/memories/import/${item.id}`} className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 text-sm">
                      {item.sourceLabel}
                      <span className="text-xs opacity-50">
                        {new Date(item.importedAt).toLocaleDateString("ko-KR")}
                      </span>
                    </span>
                    <span className="text-xs opacity-60">
                      {item.status === "PENDING"
                        ? `검토할 후보 ${item.pendingCount}개`
                        : "검토 끝"}
                      {item.acceptedCount > 0 ? ` · 기억이 된 것 ${item.acceptedCount}개` : ""}
                      {item.truncated ? " · 일부만 뽑힘" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
