"use client";

import { useEffect, useState } from "react";
import type { Topic } from "@/src/server/topic/types";

/**
 * 지금 대화를 주제에 연결한다.
 *
 * 대화 전체가 아니라 구간을 연결한다. 하나의 대화에 두 주제가 섞여도
 * 각 구간만 붙는다(05 T05). 지금은 "이 대화 전체" 범위만 제공하고,
 * 구간을 손으로 고르는 기능은 필요해질 때 붙인다.
 *
 * 연결해도 원문은 움직이지 않는다. 화면도 전환되지 않는다(D44).
 */
export function LinkToTopic({
  conversationId,
  startSeq,
  endSeq,
}: {
  conversationId: string;
  startSeq: number;
  endSeq: number;
}) {
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || topics !== null) return;
    fetch("/api/topics")
      .then((r) => r.json())
      .then((body) => setTopics(body.topics ?? []))
      .catch(() => setTopics([]));
  }, [open, topics]);

  async function link(topicId: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/topics/${topicId}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, startSeq, endSeq }),
      });
      const body = await response.json();
      setMessage(response.ok ? "주제에 연결했다." : (body.error ?? "연결하지 못했다."));
    } catch {
      setMessage("서버에 연결하지 못했다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 pb-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="underline underline-offset-4 opacity-70"
      >
        이 대화를 주제에 연결
      </button>

      {open ? (
        <div className="flex flex-col gap-1 pt-2">
          {topics === null ? <p className="opacity-60">주제를 읽는 중…</p> : null}
          {topics !== null && topics.length === 0 ? (
            <p className="opacity-60">만들어 둔 주제가 없다. 주제 화면에서 먼저 만든다.</p>
          ) : null}
          {(topics ?? []).map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => link(topic.id)}
              disabled={busy}
              className="self-start underline underline-offset-4 opacity-80 disabled:opacity-40"
            >
              {topic.title}
            </button>
          ))}
          {message ? <p role="status" className="pt-1 opacity-70">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
