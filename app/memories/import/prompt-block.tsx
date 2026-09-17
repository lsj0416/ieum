"use client";

import { useState } from "react";
import { IMPORT_PROMPT } from "@/src/server/memory/import-types";

/**
 * 기존 AI에 붙여넣을 정리용 프롬프트.
 *
 * 모델을 부르지 않는다. 고정된 글을 보여주고 복사만 시킨다. 06 8절의
 * 1단계이며, 여기서 형식을 정해두면 되돌아온 글에서 근거를 뽑기 쉽다.
 */
export function PromptBlock() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // 클립보드 권한이 없을 수 있다. 그때는 아래 글을 직접 긁어 복사한다.
      setCopied(false);
    }
  }

  return (
    <details className="rounded-md border border-black/10 p-3 dark:border-white/15">
      <summary className="cursor-pointer text-sm">1. 기존 AI에 넣을 프롬프트</summary>

      <div className="flex flex-col gap-2 pt-2">
        <p className="text-xs opacity-60">
          쓰던 AI에 아래 글을 붙여넣고, 돌아온 답을 통째로 복사해 2번 칸에 넣는다.
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-black/10 p-2.5 text-xs leading-relaxed dark:border-white/15">
          {IMPORT_PROMPT}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="self-start rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/20"
        >
          {copied ? "복사했다" : "프롬프트 복사"}
        </button>
      </div>
    </details>
  );
}
