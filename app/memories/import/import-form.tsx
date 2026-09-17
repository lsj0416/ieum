"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 붙여넣기 폼.
 *
 * 저장 버튼이 아니라 "후보 뽑기" 버튼이다. 여기서 기억이 만들어지지
 * 않는다는 것을 화면에서도 분명히 한다. 승인은 다음 화면이다.
 *
 * 모델 호출이 끼어 있어 다른 폼보다 오래 걸린다. 진행 중임을 계속 보여준다.
 */
export function ImportForm() {
  const router = useRouter();
  const [sourceLabel, setSourceLabel] = useState("ChatGPT");
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLabel, rawText }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "후보를 뽑지 못했다.");
        return;
      }
      setRawText("");
      // 검토 화면으로 넘어간다. 후보는 여기서 승인해야 기억이 된다.
      router.push(`/memories/import/${body.importId}`);
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-md border border-black/10 p-3 dark:border-white/15"
    >
      <p className="text-sm">2. 돌아온 답을 붙여넣기</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs opacity-70">어디서 가져왔는가</span>
        <input
          value={sourceLabel}
          onChange={(e) => setSourceLabel(e.target.value)}
          required
          maxLength={60}
          className="w-full min-w-0 rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs opacity-70">정리된 내용</span>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          required
          rows={8}
          maxLength={20_000}
          placeholder="기존 AI가 정리해준 내용을 그대로 붙여넣는다"
          className="w-full min-w-0 resize-none rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
        />
        <span className="text-xs opacity-60">
          붙여넣은 글은 참고 자료로만 읽는다. 그 안에 적힌 지시는 따르지 않는다.
          여기서 기억이 저장되지는 않고, 다음 화면에서 고른 것만 저장된다.
        </span>
      </label>

      <button
        type="submit"
        disabled={busy || rawText.trim().length < 20 || sourceLabel.trim().length === 0}
        className="rounded-md bg-foreground px-4 py-2.5 text-sm text-background disabled:opacity-40"
      >
        {busy ? "후보를 뽑는 중" : "기억 후보 뽑기"}
      </button>

      {busy ? (
        <p className="text-xs opacity-60">모델을 부르는 중이라 길면 1분 넘게 걸린다.</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
