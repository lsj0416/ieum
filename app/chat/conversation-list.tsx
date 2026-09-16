"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConversationSummary } from "@/src/server/conversation/queries";

/**
 * 대화 목록. 접어둔다.
 *
 * 모바일에서 목록이 늘 펼쳐져 있으면 대화가 밀린다. 기본 화면은 대화다
 * (05 4.2절).
 */
export function ConversationList({
  conversations,
  currentId,
}: {
  conversations: ConversationSummary[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const current = conversations.find((c) => c.id === currentId);
  const label = currentId === null ? "새 대화" : (current?.title ?? "제목 없는 대화");

  async function rename(id: string) {
    if (busy || draftTitle.trim().length === 0) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle }),
      });
      if (response.ok) {
        setRenamingId(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      // 감추기만 한다. 원문은 남는다.
      const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (response.ok) {
        if (id === currentId) router.push("/chat");
        else router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 pb-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1 text-sm"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-xs opacity-50">({conversations.length})</span>
        </button>
        <Link
          href="/chat/new"
          className="ml-auto shrink-0 rounded-md border border-black/15 px-2.5 py-1 text-xs dark:border-white/20"
        >
          새 대화
        </Link>
      </div>

      {open ? (
        <ul className="flex flex-col gap-1 pt-2">
          {conversations.length === 0 ? (
            <li className="text-xs opacity-60">저장된 대화가 없다.</li>
          ) : null}

          {conversations.map((conversation) => (
            <li key={conversation.id} className="flex items-center gap-2 text-sm">
              {renamingId === conversation.id ? (
                <>
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    aria-label="대화 제목"
                    className="min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/20"
                  />
                  <button
                    type="button"
                    onClick={() => rename(conversation.id)}
                    disabled={busy}
                    className="shrink-0 text-xs underline underline-offset-4 disabled:opacity-40"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="shrink-0 text-xs underline underline-offset-4 opacity-70"
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href={`/chat/${conversation.id}`}
                    aria-current={conversation.id === currentId ? "page" : undefined}
                    className={[
                      "min-w-0 flex-1 truncate",
                      conversation.id === currentId ? "font-semibold" : "opacity-80",
                    ].join(" ")}
                  >
                    {conversation.title ?? "제목 없는 대화"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(conversation.id);
                      setDraftTitle(conversation.title ?? "");
                    }}
                    className="shrink-0 text-xs underline underline-offset-4 opacity-70"
                  >
                    이름
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(conversation.id)}
                    disabled={busy}
                    title="목록에서만 감춘다. 원문은 지워지지 않는다."
                    className="shrink-0 text-xs underline underline-offset-4 opacity-70 disabled:opacity-40"
                  >
                    숨김
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
