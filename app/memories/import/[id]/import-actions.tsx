"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 가져오기 단위의 되돌리기와 다시 뽑기.
 *
 * 추출 기준은 앞으로도 바뀐다. 기준이 바뀌었을 때 원문을 다시 찾아
 * 붙여넣게 하면 안 된다. 원문은 이미 저장돼 있다.
 *
 * 잘못된 기준으로 수십 건이 저장된 경우도 마찬가지다. 화면에서 하나씩
 * 지우는 것은 현실적이지 않으므로 가져오기 단위로 되돌린다.
 */
export function ImportActions({
  importId,
  acceptedCount,
}: {
  importId: string;
  /** 이 가져오기에서 기억이 된 후보 수. 0이면 되돌릴 것이 없다. */
  acceptedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "forget" | "reextract">(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function forget() {
    if (busy) return;
    setBusy("forget");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/imports/${importId}/memories`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "잊지 못했다.");
        return;
      }
      setConfirming(false);
      setNotice(`${body.forgotten}건을 잊었다. 기록은 남아 있어 무엇을 지웠는지 확인할 수 있다.`);
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setBusy(null);
    }
  }

  async function reextract() {
    if (busy) return;
    setBusy("reextract");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/imports/${importId}/reextract`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "다시 뽑지 못했다.");
        return;
      }
      // 새 가져오기가 만들어졌다. 예전 것은 기록으로 남는다.
      router.push(`/memories/import/${body.importId}`);
    } catch {
      setError("서버에 연결하지 못했다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-black/10 p-3 dark:border-white/15">
      <div className="flex flex-wrap gap-3 text-xs">
        <button
          type="button"
          onClick={reextract}
          disabled={busy !== null}
          className="underline underline-offset-4 disabled:opacity-40"
        >
          {busy === "reextract" ? "다시 뽑는 중" : "같은 원문으로 다시 뽑기"}
        </button>

        {acceptedCount > 0 ? (
          <button
            type="button"
            onClick={() => setConfirming((v) => !v)}
            disabled={busy !== null}
            className="underline underline-offset-4 disabled:opacity-40"
          >
            이 가져오기로 만든 기억 {acceptedCount}건 잊기
          </button>
        ) : null}
      </div>

      <p className="text-xs opacity-60">
        다시 뽑으면 새 가져오기가 만들어지고 이 기록은 그대로 남는다. 원문을 다시 붙여넣을 필요는 없다.
      </p>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-md border border-black/15 p-2.5 text-xs dark:border-white/20">
          <p className="opacity-80">
            이 가져오기에서 만들어진 기억 {acceptedCount}건을 모두 잊는다. 행은 남으므로 무엇을
            지웠는지는 나중에도 확인할 수 있다.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={forget}
              disabled={busy !== null}
              className="underline underline-offset-4 disabled:opacity-40"
            >
              {busy === "forget" ? "잊는 중" : "그래도 잊기"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="opacity-70 underline underline-offset-4"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {busy === "reextract" ? (
        <p className="text-xs opacity-60">모델을 부르는 중이라 길면 1분 넘게 걸린다.</p>
      ) : null}

      {notice ? <p className="text-xs opacity-70">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
