"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KIND_LABELS, MEMORY_KINDS, type MemoryKind } from "@/src/server/memory/types";
import {
  ATTRIBUTION_LABELS,
  type MemoryCandidate,
  type MemoryImportWithCandidates,
} from "@/src/server/memory/import-types";

type Draft = { checked: boolean; kind: MemoryKind; content: string };

/**
 * 후보 검토.
 *
 * 기본값이 중요하다. 민감 정보로 판정된 것과 근거가 원문에서 확인되지 않은
 * 것은 체크를 꺼둔다. 06 8절이 "민감 정보는 기본적으로 제외한다"고 정했고,
 * 확인되지 않은 근거를 눈감고 승인하면 출처가 있다는 말이 무의미해진다.
 *
 * 저장은 고른 것만 한다. 고르지 않은 것은 제외로 기록된다. 지우지 않고
 * 남기는 이유는 나중에 같은 내용을 다시 권하지 않기 위해서다.
 */
export function CandidateReview({ data }: { data: MemoryImportWithCandidates }) {
  const router = useRouter();
  const pending = data.candidates.filter((c) => c.status === "PENDING");
  const decided = data.candidates.filter((c) => c.status !== "PENDING");

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      pending.map((c) => [
        c.id,
        { checked: !c.sensitive && c.quoteVerified, kind: c.kind, content: c.content },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const checkedCount = pending.filter((c) => drafts[c.id]?.checked).length;

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const decisions = pending.map((c) => {
        const draft = drafts[c.id];
        return draft.checked
          ? { id: c.id, decision: "ACCEPT", kind: draft.kind, content: draft.content }
          : { id: c.id, decision: "REJECT" };
      });

      const response = await fetch(`/api/imports/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "저장하지 못했다.");
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
    <div className="flex flex-col gap-4">
      {pending.length === 0 ? (
        <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
          검토할 후보가 없다.
        </p>
      ) : (
        <>
          <p className="text-xs opacity-60">
            고른 것만 기억이 된다. 고르지 않은 것은 제외로 남는다. 내용과 종류는 고칠 수 있다.
          </p>

          <ul className="flex flex-col gap-2">
            {pending.map((c) => {
              const draft = drafts[c.id];
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-md border border-black/10 p-3 dark:border-white/15"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={draft.checked}
                      onChange={(e) => update(c.id, { checked: e.target.checked })}
                      aria-label="이 후보를 기억으로 저장"
                      className="mt-1 size-4 shrink-0"
                    />
                    <textarea
                      value={draft.content}
                      onChange={(e) => update(c.id, { content: e.target.value })}
                      rows={2}
                      aria-label="기억할 내용"
                      className="w-full min-w-0 resize-none rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pl-6">
                    {MEMORY_KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => update(c.id, { kind: k })}
                        aria-pressed={draft.kind === k}
                        className={[
                          "rounded-md border px-2 py-0.5 text-xs",
                          draft.kind === k
                            ? "border-transparent bg-foreground text-background"
                            : "border-black/15 dark:border-white/20",
                        ].join(" ")}
                      >
                        {KIND_LABELS[k]}
                      </button>
                    ))}
                    <span className="text-xs opacity-60">{ATTRIBUTION_LABELS[c.attribution]}</span>
                  </div>

                  <Flags candidate={c} />

                  <details className="pl-6">
                    <summary className="cursor-pointer text-xs opacity-60">근거 보기</summary>
                    <p className="whitespace-pre-wrap break-words border-l-2 border-current/20 pl-2 pt-1 text-xs opacity-70">
                      {c.quote}
                    </p>
                  </details>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-foreground px-4 py-2.5 text-sm text-background disabled:opacity-40"
          >
            {busy
              ? "저장 중"
              : `고른 ${checkedCount}개를 기억에 저장하고 나머지 ${pending.length - checkedCount}개는 제외`}
          </button>

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </>
      )}

      {decided.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm">이미 결정한 것</h2>
          <ul className="flex flex-col gap-1.5">
            {decided.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 opacity-50">
                  {c.status === "ACCEPTED" ? "저장함" : "제외함"}
                </span>
                <span className={c.status === "ACCEPTED" ? "" : "line-through opacity-50"}>
                  {c.content}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** 승인 전에 알아야 할 것. 조용히 넘어가면 안 되는 두 가지다. */
function Flags({ candidate }: { candidate: MemoryCandidate }) {
  if (candidate.quoteVerified && !candidate.sensitive) return null;

  return (
    <ul className="flex flex-col gap-1 pl-6 text-xs text-amber-700 dark:text-amber-400">
      {!candidate.quoteVerified ? (
        <li>근거로 적힌 문장을 붙여넣은 원문에서 찾지 못했다. 원문을 확인하고 판단한다.</li>
      ) : null}
      {candidate.sensitive ? <li>민감할 수 있는 내용이다. 기본적으로 제외한다.</li> : null}
    </ul>
  );
}
