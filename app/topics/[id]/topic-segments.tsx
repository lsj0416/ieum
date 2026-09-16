"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TopicSegment } from "@/src/server/topic/types";

/**
 * 주제에 연결된 대화 구간.
 *
 * 연결을 해제해도 원문은 그대로다. 주제에서만 빠진다.
 */
export function TopicSegments({
  topicId,
  segments,
}: {
  topicId: string;
  segments: TopicSegment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unlink(segmentId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/topics/${topicId}/segments?segmentId=${segmentId}`, {
        method: "DELETE",
      });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (segments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
        연결된 대화가 없다. 대화 화면에서 구간을 이 주제에 연결한다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {segments.map((segment) => (
        <li key={segment.segmentId} className="rounded-md border border-black/10 p-3 dark:border-white/15">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/chat/${segment.conversationId}`}
              className="min-w-0 flex-1 truncate text-sm underline underline-offset-4"
            >
              {segment.conversationTitle ?? "제목 없는 대화"}
            </Link>
            <button
              type="button"
              onClick={() => unlink(segment.segmentId)}
              disabled={busy}
              title="주제에서만 뺀다. 원문은 지워지지 않는다."
              className="shrink-0 text-xs underline underline-offset-4 opacity-70 disabled:opacity-40"
            >
              연결 해제
            </button>
          </div>
          <p className="truncate pt-1 text-xs opacity-60">{segment.preview}</p>
          <p className="pt-0.5 text-xs opacity-40">
            메시지 {segment.startSeq}–{segment.endSeq} · {segment.source === "AUTO" ? "자동" : "직접"} 연결
          </p>
        </li>
      ))}
    </ul>
  );
}
