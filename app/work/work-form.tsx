"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WorkForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || title.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, nextAction: nextAction || null }),
      });
      if (!response.ok) {
        setError((await response.json()).error ?? "만들지 못했다.");
        return;
      }
      setTitle("");
      setNextAction("");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-md border border-black/10 p-3 dark:border-white/15">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="진행 중인 일"
        aria-label="일의 제목"
        className="h-11 w-full min-w-0 rounded-md border border-black/15 bg-transparent px-3 text-base dark:border-white/20"
      />
      <input
        value={nextAction}
        onChange={(e) => setNextAction(e.target.value)}
        placeholder="다음에 할 일 (선택)"
        aria-label="다음 행동"
        className="h-11 w-full min-w-0 rounded-md border border-black/15 bg-transparent px-3 text-base dark:border-white/20"
      />
      <button
        type="submit"
        disabled={saving || title.trim().length === 0}
        className="rounded-md bg-foreground px-4 py-2.5 text-sm text-background disabled:opacity-40"
      >
        {saving ? "만드는 중" : "추가"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
