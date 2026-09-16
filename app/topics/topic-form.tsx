"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 주제를 직접 만든다. 자동 발견은 S4-A이며 지금은 수동 등록만 있다. */
export function TopicForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || title.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "만들지 못했다.");
        return;
      }
      setTitle("");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="새 주제 이름"
          aria-label="새 주제 이름"
          className="h-11 w-full min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-3 text-base dark:border-white/20"
        />
        <button
          type="submit"
          disabled={saving || title.trim().length === 0}
          className="h-11 shrink-0 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-40"
        >
          {saving ? "만드는 중" : "만들기"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
