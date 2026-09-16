"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WORK_STATUS_LABELS, type WorkItem, type WorkStatus } from "@/src/server/work/types";

/**
 * 진행 중인 일 목록.
 *
 * 완료 처리하면 다음 행동을 비운다. 끝난 일에 다음 행동이 남아 있으면
 * 모델이 그것을 계속 권한다(E03).
 */
export function WorkList({ items }: { items: WorkItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function patch(id: string, payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/work/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setEditingId(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
        진행 중인 일이 없다. 위에서 추가한다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border border-black/10 p-3 dark:border-white/15">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
            <span className="shrink-0 rounded border border-black/15 px-1.5 py-0.5 text-xs opacity-70 dark:border-white/20">
              {WORK_STATUS_LABELS[item.status]}
            </span>
          </div>

          {item.goal ? <p className="pt-1 text-xs opacity-70">{item.goal}</p> : null}
          {item.topicTitle ? (
            <p className="pt-1 text-xs opacity-50">주제: {item.topicTitle}</p>
          ) : null}

          <div className="pt-2 text-sm">
            {editingId === item.id ? (
              <div className="flex items-end gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="다음 행동"
                  placeholder="다음에 할 일"
                  className="h-10 w-full min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-2 text-sm dark:border-white/20"
                />
                <button
                  type="button"
                  onClick={() => patch(item.id, { nextAction: draft })}
                  disabled={busy}
                  className="shrink-0 text-xs underline underline-offset-4 disabled:opacity-40"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="shrink-0 text-xs underline underline-offset-4 opacity-70"
                >
                  취소
                </button>
              </div>
            ) : (
              <p className="opacity-80">
                다음 행동: {item.nextAction ?? <span className="opacity-50">아직 없음</span>}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 pt-2 text-xs opacity-70">
            {editingId !== item.id ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(item.id);
                  setDraft(item.nextAction ?? "");
                }}
                className="underline underline-offset-4"
              >
                다음 행동 정하기
              </button>
            ) : null}

            {(["ACTIVE", "PAUSED", "DONE"] as WorkStatus[])
              .filter((s) => s !== item.status)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch(item.id, { status: s })}
                  disabled={busy}
                  className="underline underline-offset-4 disabled:opacity-40"
                >
                  {WORK_STATUS_LABELS[s]}로
                </button>
              ))}
          </div>

          <p className="pt-2 text-xs opacity-40">
            마지막 확인 {new Date(item.lastConfirmedAt).toLocaleDateString("ko-KR")}
          </p>
        </li>
      ))}
    </ul>
  );
}
