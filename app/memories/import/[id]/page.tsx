import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen } from "@/app/ui/screen";
import { requireOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getImport } from "@/src/server/memory/import-service";
import { CandidateReview } from "./candidate-review";

export const metadata: Metadata = {
  title: "가져온 내용 검토 · ieum",
};

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const owner = await requireOwner();
  const { id } = await params;
  const supabase = await createClient();

  const data = await getImport({ supabase, ownerId: owner.id, importId: id });
  // 남의 가져오기와 없는 가져오기를 같은 화면으로 거절한다.
  if (!data) notFound();

  return (
    <Screen title="가져온 내용 검토" wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs opacity-60">
            {data.sourceLabel}에서 {new Date(data.importedAt).toLocaleDateString("ko-KR")}에 가져왔다.
          </p>
          <Link
            href="/memories/import"
            className="shrink-0 text-xs underline underline-offset-4 opacity-70"
          >
            가져오기
          </Link>
        </div>

        {/* 잘린 추출을 조용히 넘기지 않는다. 이게 전부라고 오해하면
            빠진 내용을 다시 가져올 생각을 못 한다. */}
        {data.truncated ? (
          <p className="rounded-md border border-amber-600/40 p-3 text-xs text-amber-700 dark:text-amber-400">
            원문이 길어 모델 답변이 중간에 잘렸다. 온전하게 뽑힌 후보까지만 아래에 있고, 뒷부분은
            빠졌을 수 있다. 빠진 내용이 있으면 원문을 나눠서 다시 가져온다.
          </p>
        ) : null}

        <CandidateReview data={data} />

        {/* 근거를 대조할 수 있게 원문을 남겨둔다. 접어두는 것은 길어서다. */}
        <details className="rounded-md border border-black/10 p-3 dark:border-white/15">
          <summary className="cursor-pointer text-xs opacity-60">붙여넣은 원문 보기</summary>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words pt-2 text-xs leading-relaxed opacity-80">
            {data.rawText}
          </pre>
        </details>
      </div>
    </Screen>
  );
}
