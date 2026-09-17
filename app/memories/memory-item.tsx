"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KIND_LABELS, MEMORY_KINDS, type MemoryKind, type MemoryWithEvidence } from "@/src/server/memory/types";

/**
 * 기억 한 건. 정정과 삭제를 여기서 한다.
 *
 * 정정은 값을 덮어쓰지 않는다. 서버가 이전 버전을 닫고 새 버전을 만든다.
 * 화면은 그 결과를 다시 읽어 보여준다.
 */
export function MemoryItem({ memory }: { memory: MemoryWithEvidence }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<MemoryKind>(memory.kind);
  const [content, setContent] = useState(memory.content);
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/memories/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, content, quote, expectedVersion: memory.version }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "고치지 못했다.");
        return;
      }
      setEditing(false);
      setQuote("");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(mode: "forget" | "with_source") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/memories/${memory.id}?mode=${mode}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? "지우지 못했다.");
        return;
      }
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-black/10 p-3 dark:border-white/15">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded border border-black/15 px-1.5 py-0.5 text-xs opacity-70 dark:border-white/20">
            {KIND_LABELS[memory.kind]}
          </span>
          <span className="text-xs opacity-50">
            {new Date(memory.updatedAt).toLocaleDateString("ko-KR")}
          </span>
          {/* 정정을 거친 기억임을 드러낸다. 몇 번째 판인지 알 수 있어야 한다. */}
          {memory.supersedesId ? <span className="text-xs opacity-50">정정됨</span> : null}
          {/* 직접 등록한 것과 외부에서 가져온 것을 화면에서도 구분한다. */}
          {memory.originImportId ? <span className="text-xs opacity-50">가져옴</span> : null}
          {memory.source === "MODEL" ? <span className="text-xs opacity-50">AI 추정</span> : null}
        </div>

        {!editing ? (
          <div className="flex shrink-0 gap-2 text-xs opacity-70">
            <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-4">
              정정
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete((v) => !v)}
              className="underline underline-offset-4"
            >
              삭제
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 pt-2">
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
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            aria-label="고칠 내용"
            className="w-full min-w-0 resize-none rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
          />
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={2}
            placeholder="정정하는 근거"
            aria-label="정정 근거"
            className="w-full min-w-0 resize-none rounded-md border border-black/15 bg-transparent px-3 py-2 text-base dark:border-white/20"
          />
          <p className="text-xs opacity-60">
            이전 내용은 지워지지 않는다. 닫아두고 새 버전을 만든다.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || content.trim().length === 0 || quote.trim().length === 0}
              className="rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-40"
            >
              {busy ? "저장 중" : "정정 저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setContent(memory.content);
                setKind(memory.kind);
                setQuote("");
                setError(null);
              }}
              className="text-sm underline underline-offset-4 opacity-70"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words pt-2 text-sm">{memory.content}</p>
      )}

      {confirmingDelete && !editing ? (
        <div className="flex flex-col gap-2 rounded-md border border-black/15 p-2.5 mt-2 text-xs dark:border-white/20">
          <p className="opacity-80">어디까지 지울지 고른다.</p>
          <button
            type="button"
            onClick={() => remove("forget")}
            disabled={busy}
            className="text-left underline underline-offset-4 disabled:opacity-40"
          >
            기억에서만 잊기
            <span className="block pt-0.5 opacity-60">
              출처가 된 대화는 남는다. 모델이 그 대화를 읽고 같은 이야기를 다시 할 수 있다.
            </span>
          </button>
          <button
            type="button"
            onClick={() => remove("with_source")}
            disabled={busy}
            className="text-left underline underline-offset-4 disabled:opacity-40"
          >
            출처 대화까지 제외
            <span className="block pt-0.5 opacity-60">
              대화 기록에는 남지만 모델에게 더는 전달되지 않는다.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className="self-start opacity-70 underline underline-offset-4"
          >
            취소
          </button>
        </div>
      ) : null}

      {memory.evidence.length > 0 && !editing ? (
        <details className="pt-2">
          <summary className="cursor-pointer text-xs opacity-60">근거 보기</summary>
          <ul className="flex flex-col gap-1 pt-1">
            {memory.evidence.map((e) => (
              <li
                key={e.id}
                className="whitespace-pre-wrap break-words border-l-2 border-current/20 pl-2 text-xs opacity-70"
              >
                {e.quote}
                <span className="pl-1 opacity-60">
                  (
                  {e.sourceKind === "CHAT"
                    ? "대화에서"
                    : e.sourceKind === "IMPORT"
                      ? "가져온 원문에서"
                      : "직접 입력"}
                  )
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? (
        <p role="alert" className="pt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </li>
  );
}
