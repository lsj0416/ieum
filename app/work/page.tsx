import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { listWorkItems } from "@/src/server/work/service";
import { WorkForm } from "./work-form";
import { WorkList } from "./work-list";

export const metadata: Metadata = {
  title: "진행 중인 일 · ieum",
};

export default async function WorkPage() {
  const owner = await requireOwner();
  const supabase = await createClient();
  const items = await listWorkItems({ supabase, ownerId: owner.id });

  return (
    <Screen title="진행 중인 일" wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs opacity-60">
            마지막 결정과 다음 행동을 여기 적어두면 새 대화에서 이어간다. {items.length}개.
          </p>
          <Link href="/chat" className="shrink-0 text-xs underline underline-offset-4 opacity-70">
            대화로
          </Link>
        </div>

        <WorkForm />
        <WorkList items={items} />
      </div>
    </Screen>
  );
}
