"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/src/server/conversation/queries";

/** 화면에만 존재하는 상태. 서버에 저장된 메시지와 구분한다. */
type PendingTurn = {
  clientRequestId: string;
  content: string;
  error: string | null;
};

export function ChatView({
  initialMessages,
  initialConversationId,
}: {
  initialMessages: ChatMessage[];
  initialConversationId: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [turn, setTurn] = useState<PendingTurn | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 붙으면 아래로 내린다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, turn]);

  async function send(content: string, clientRequestId: string) {
    setSending(true);
    setTurn({ clientRequestId, content, error: null });
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, clientRequestId, conversationId }),
      });
      const body = await response.json();

      if (!response.ok) {
        setTurn({ clientRequestId, content, error: body.error ?? "요청을 처리하지 못했다." });
        return;
      }
      if (body.status === "failed") {
        // 사용자 입력은 이미 서버에 저장되어 있다. 다시 입력할 필요는 없다.
        setTurn({ clientRequestId, content, error: body.reason ?? "답변을 받지 못했다." });
        return;
      }

      setConversationId(body.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: `${clientRequestId}-user`, role: "user", content, status: "completed" },
        { id: `${clientRequestId}-assistant`, role: "assistant", content: body.answer, status: "completed" },
      ]);
      setTurn(null);
    } catch {
      setTurn({ clientRequestId, content, error: "서버에 연결하지 못했다." });
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    void send(content, crypto.randomUUID());
  }

  // 재시도는 같은 clientRequestId를 다시 쓴다. 서버가 중복을 걸러내므로
  // 성공했는데 응답만 못 받은 경우에도 답변이 두 번 생기지 않는다.
  function retry() {
    if (!turn || sending) return;
    void send(turn.content, turn.clientRequestId);
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 && !turn ? (
          <p className="rounded-md border border-dashed border-black/20 p-3 text-xs opacity-60 dark:border-white/25">
            저장된 대화가 없다. 아래에 메시지를 입력한다.
          </p>
        ) : null}

        {messages.map((message) => (
          <Bubble key={message.id} role={message.role} status={message.status}>
            {message.content}
          </Bubble>
        ))}

        {turn ? (
          <>
            <Bubble role="user" status="completed">
              {turn.content}
            </Bubble>
            {turn.error ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/40 p-3 text-sm text-red-700 dark:text-red-300"
              >
                <p>{turn.error}</p>
                <button
                  type="button"
                  onClick={retry}
                  disabled={sending}
                  className="mt-2 underline underline-offset-4 disabled:opacity-40"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <p className="text-sm opacity-50">답변을 생성하는 중…</p>
            )}
          </>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 pt-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter는 전송, Shift+Enter는 줄바꿈. 모바일에서는 줄바꿈이
            // 기본이라 이 처리는 물리 키보드에서만 의미가 있다.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit(event);
            }
          }}
          rows={1}
          placeholder="메시지를 입력하세요"
          className="min-h-11 w-full min-w-0 flex-1 resize-none rounded-md border border-black/15 bg-transparent px-3 py-2.5 text-base dark:border-white/20"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="h-11 shrink-0 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-40"
        >
          {sending ? "전송 중" : "보내기"}
        </button>
      </form>
    </>
  );
}

function Bubble({
  role,
  status,
  children,
}: {
  role: ChatMessage["role"];
  status: ChatMessage["status"];
  children: React.ReactNode;
}) {
  const mine = role === "user";

  // 실패하거나 끊긴 답변을 정상 답변처럼 보여주지 않는다.
  if (role === "assistant" && status !== "completed") {
    return (
      <p className="self-start text-sm opacity-60">
        {status === "pending" ? "답변을 생성하다 중단되었다." : "답변을 받지 못했다."}
      </p>
    );
  }

  return (
    <div
      className={[
        "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
        mine
          ? "self-end bg-foreground text-background"
          : "self-start border border-black/10 dark:border-white/15",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
