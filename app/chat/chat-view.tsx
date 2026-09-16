"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/src/server/conversation/queries";
import { Markdown } from "./markdown";

/** 화면에만 존재하는 상태. 서버에 저장된 메시지와 구분한다. */
type PendingTurn = {
  clientRequestId: string;
  content: string;
  error: string | null;
  /** 지금까지 받은 답변. 스트리밍 도중에도 화면에 보여준다. */
  streamed: string;
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
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // 새 메시지가 붙으면 아래로 내린다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, turn]);

  // 입력이 길어지면 입력칸이 함께 자란다.
  //
  // CSS의 field-sizing으로 할 수 있지만 iOS Safari가 아직 받지 않는다.
  // 높이를 auto로 되돌린 뒤 scrollHeight를 읽어야 줄어들 때도 맞는다.
  // 그대로 두면 한 번 커진 높이가 내려오지 않는다.
  //
  // 최대 높이는 CSS(max-h)가 잡고, 넘으면 입력칸 안에서 스크롤된다.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function send(content: string, clientRequestId: string) {
    setSending(true);
    setTurn({ clientRequestId, content, error: null, streamed: "" });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, clientRequestId, conversationId }),
      });

      if (!response.body) {
        setTurn({ clientRequestId, content, error: "응답을 읽을 수 없다.", streamed: "" });
        return;
      }

      let answer = "";
      let convId = conversationId;
      let failed: string | null = null;
      let finished: "completed" | "partial" | null = null;
      let finishReason: string | undefined;

      // NDJSON을 줄 단위로 읽는다. 마지막 줄은 다음 chunk와 이어질 수
      // 있으므로 개행이 올 때까지 버퍼에 둔다.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const raw = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!raw) continue;

          const event = JSON.parse(raw);
          if (event.type === "start") {
            convId = event.conversationId;
          } else if (event.type === "delta") {
            answer += event.text;
            // 토큰이 올 때마다 화면을 갱신한다.
            setTurn({ clientRequestId, content, error: null, streamed: answer });
          } else if (event.type === "replay") {
            convId = event.conversationId;
            answer = event.answer;
            finished = "completed";
          } else if (event.type === "done") {
            finished = event.status;
            finishReason = event.reason;
          } else if (event.type === "error") {
            failed = event.message;
          }
        }
      }

      if (failed !== null || finished === null) {
        setTurn({ clientRequestId, content, error: failed ?? "답변을 받지 못했다.", streamed: answer });
        return;
      }

      setConversationId(convId);
      setMessages((prev) => [
        ...prev,
        { id: `${clientRequestId}-user`, role: "user", content, status: "completed" },
        {
          id: `${clientRequestId}-assistant`,
          role: "assistant",
          content: answer,
          // 끊긴 답변을 완료로 표시하지 않는다.
          status: finished,
          partialReason: finishReason,
        },
      ]);
      setTurn(null);
    } catch {
      setTurn({ clientRequestId, content, error: "서버에 연결하지 못했다.", streamed: "" });
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
          <Bubble
            key={message.id}
            role={message.role}
            status={message.status}
            partialReason={message.partialReason}
          >
            {message.content}
          </Bubble>
        ))}

        {turn ? (
          <>
            <Bubble role="user" status="completed">
              {turn.content}
            </Bubble>
            {turn.streamed.length > 0 ? (
              <Bubble role="assistant" status="completed">
                {turn.streamed}
              </Bubble>
            ) : null}

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
            ) : turn.streamed.length === 0 ? (
              <p className="text-sm opacity-50">답변을 생성하는 중…</p>
            ) : null}
          </>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 pt-3">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // 한글은 조합 중에도 keydown이 온다. 조합이 끝나기 전에 전송하면
            // 마지막 글자가 입력창에 남는다. isComposing일 때는 흘려보낸다.
            if (event.nativeEvent.isComposing) return;

            // Enter는 전송, Shift+Enter는 줄바꿈. 모바일에서는 줄바꿈이
            // 기본이라 이 처리는 물리 키보드에서만 의미가 있다.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit(event);
            }
          }}
          rows={1}
          placeholder="메시지를 입력하세요"
          // max-h는 대략 네 줄 높이다. 그보다 길어지면 입력칸 안에서 스크롤된다.
          className="max-h-32 min-h-11 w-full min-w-0 flex-1 resize-none overflow-y-auto rounded-md border border-black/15 bg-transparent px-3 py-2.5 text-base dark:border-white/20"
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
  partialReason,
  children,
}: {
  role: ChatMessage["role"];
  status: ChatMessage["status"];
  /** partial일 때 왜 멈췄는지. length면 출력 상한, 그 밖은 중단이다. */
  partialReason?: string;
  children: React.ReactNode;
}) {
  const mine = role === "user";

  // 실패하거나 끊긴 답변을 정상 답변처럼 보여주지 않는다.
  if (role === "assistant" && status === "failed") {
    return <p className="self-start text-sm opacity-60">답변을 받지 못했다.</p>;
  }
  if (role === "assistant" && status === "pending") {
    return <p className="self-start text-sm opacity-60">답변을 생성하다 중단되었다.</p>;
  }

  return (
    <div className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
    <div
      className={[
        // 답변은 넓은 화면에서도 한 줄이 너무 길어지지 않게 조인다.
        // 한 줄이 길면 다음 줄 첫 글자를 찾기 어려워 읽기 나빠진다.
        "break-words rounded-lg px-3 py-2 text-sm",
        mine ? "max-w-[85%] whitespace-pre-wrap" : "w-full md:max-w-[46rem]",
        mine
          ? "self-end bg-foreground text-background"
          : "self-start border border-black/10 dark:border-white/15",
      ].join(" ")}
    >
      {mine ? children : <Markdown>{String(children)}</Markdown>}
    </div>
    {role === "assistant" && status === "partial" ? (
      <p className="pt-1 text-xs opacity-60">
        {partialReason === "length"
          ? "답변이 길이 상한에 걸려 여기서 멈췄다."
          : "답변이 도중에 끊겼다."}
      </p>
    ) : null}
    </div>
  );
}
