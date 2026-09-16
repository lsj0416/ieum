"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MEMORY_KINDS, KIND_HINTS, KIND_LABELS, type MemoryKind } from "@/src/server/memory/types";

/**
 * 기억 등록 폼.
 *
 * 근거를 반드시 함께 받는다. 화면에서 생략할 수 있게 두면 근거 없는
 * 기억이 쌓이고, 나중에 "왜 이걸 알고 있지"를 답할 수 없다.
 */
export function MemoryForm() {
  const router = useRouter();
  const [kind, setKind] = useState<MemoryKind>("FACT");
  const [content, setContent] = useState("");
  const [quote, setQuote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, content, quote, sourceMessageId: null }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "저장하지 못했다.");
        return;
      }
      setContent("");
      setQuote("");
      // 서버에서 목록을 다시 읽는다. 화면 상태가 아니라 DB가 진실이다.
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-md border border-black/10 p-3 dark:border-white/15">
      <div className="flex flex-wrap gap-1.5">
        {MEMORY_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={[
              "rounded-md border px-2.5 py-1 text-xs",
              kind === k
                ? "border-transparent bg-foreground text-background"
                : "border-black/15 dark:border-white/20",
            ].join(" ")}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <p className="text-xs opacity-60">{KIND_HINTS[kind]}</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm">기억할 내용</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={2}
          className="w-full min-w-0 resize-none rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm">근거</span>
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          required
          rows={2}
          placeholder="이 기억의 출처가 된 말이나 상황"
          className="w-full min-w-0 resize-none rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
        <span className="text-xs opacity-60">
          근거 없이 저장하지 않는다. 나중에 왜 이 사실을 알고 있는지 확인할 수 있어야 한다.
        </span>
      </label>

      <button
        type="submit"
        disabled={saving || content.trim().length === 0 || quote.trim().length === 0}
        className="rounded-md bg-foreground px-4 py-2.5 text-sm text-background disabled:opacity-40"
      >
        {saving ? "저장 중" : "기억에 등록"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
