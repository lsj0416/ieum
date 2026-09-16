"use client";

import { useState } from "react";

/**
 * 대화 입력창.
 *
 * 상태와 이벤트를 쓰므로 Client Component다.
 * 메시지 저장과 모델 호출은 S1이다. 지금은 입력만 받고 아무 데도 보내지 않는다.
 */
export function MessageComposer() {
  const [draft, setDraft] = useState("");

  const canSend = draft.trim().length > 0;

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        // 보낼 API가 없다. 새로고침만 막는다.
        event.preventDefault();
      }}
    >
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={1}
        placeholder="메시지를 입력하세요"
        // min-w-0: flex 자식의 기본 최소 폭 때문에 360px에서 넘치는 것을 막는다.
        // text-base: iOS Safari가 16px 미만 입력에서 화면을 확대하는 것을 피한다.
        className="min-h-11 w-full min-w-0 flex-1 resize-none rounded-md border border-black/15 bg-transparent px-3 py-2.5 text-base dark:border-white/20"
      />
      <button
        type="submit"
        // 대화 저장과 모델 호출이 없으므로 비활성으로 둔다.
        disabled
        aria-disabled
        title="대화 저장과 모델 호출은 S1에서 구현한다"
        className="h-11 shrink-0 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-40"
      >
        {canSend ? "보내기" : "보내기"}
      </button>
    </form>
  );
}
