import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStream } from "@/src/server/models/gateway";
import { MAX_INPUT_TOKENS } from "@/src/server/models/catalog";
import type { SendMessageInput } from "@/src/server/validation/chat";
import { activeMemoriesForContext } from "@/src/server/memory/service";
import { SYSTEM_PROMPT, buildContext } from "./context";
import { prepareTurn, type PreparedTurn } from "./service";

/**
 * 클라이언트로 보내는 사건. 줄 단위 JSON(NDJSON)으로 흘려보낸다.
 *
 * SSE 대신 NDJSON을 쓰는 이유는 형식이 단순해서다. 브라우저의 fetch로
 * 읽을 때 EventSource의 제약(GET만 가능, 헤더 못 붙임)도 피할 수 있다.
 */
export type StreamEvent =
  | {
      type: "start";
      conversationId: string;
      /** 이번 답변에 전달한 기억. 화면에서 확인할 수 있어야 한다(문서 6절). */
      usedMemories: { id: string; kind: string; content: string }[];
    }
  | { type: "delta"; text: string }
  | { type: "done"; status: "completed" | "partial"; reason?: string }
  | { type: "replay"; conversationId: string; answer: string }
  | { type: "error"; message: string; code?: string };

const encoder = new TextEncoder();

function line(event: StreamEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + "\n");
}

/**
 * 메시지를 보내고 답변을 스트리밍한다.
 *
 * 준비 단계(중복 확인, 메시지 저장, 답변 자리 예약)는 service.ts와 공유한다.
 * 여기서 다른 것은 답변을 기다리지 않고 흘려보낸다는 점, 그리고 도중에
 * 끊겼을 때 partial로 저장한다는 점이다.
 */
export async function streamMessage(params: {
  supabase: SupabaseClient;
  ownerId: string;
  input: SendMessageInput;
}): Promise<Response> {
  const { supabase, ownerId, input } = params;

  let prepared: PreparedTurn;
  try {
    prepared = await prepareTurn({ supabase, ownerId, input });
  } catch (error) {
    console.error("대화 준비 실패:", error);
    return json({ type: "error", message: "요청을 처리하지 못했다." }, 500);
  }

  if (prepared.kind === "rejected") {
    const status =
      prepared.code === "not_found" ? 404 : prepared.code === "retryable" ? 503 : 409;
    return json({ type: "error", message: prepared.message, code: prepared.code }, status);
  }

  // 이미 처리한 요청이면 저장된 답변을 그대로 돌려준다. 모델을 다시 부르지 않는다.
  if (prepared.kind === "replay") {
    return json(
      { type: "replay", conversationId: prepared.conversationId, answer: prepared.answer },
      200,
    );
  }

  const { conversationId, answerId, recent } = prepared;
  const { system, messages, usedMemories } = buildContext({
    system: SYSTEM_PROMPT,
    memories: await activeMemoriesForContext({ supabase, ownerId }),
    recent,
    current: input.content,
    maxInputTokens: MAX_INPUT_TOKENS,
  });

  const started = await generateStream({ supabase, ownerId, task: "chat", system, messages });

  if (!started.ok) {
    await supabase.from("messages").update({ status: "failed" }).eq("id", answerId);
    return json({ type: "error", message: started.message, code: started.errorKind }, 200);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "start", conversationId, usedMemories }));

      let buffered = "";
      // 토큰마다 DB를 쓰면 호출이 폭증한다. 일정 간격으로만 저장해
      // 프로세스가 죽어도 어디까지 받았는지 남게 한다.
      let lastSavedAt = Date.now();
      const SAVE_INTERVAL_MS = 2_000;

      try {
        for await (const delta of started.textStream) {
          buffered += delta;
          controller.enqueue(line({ type: "delta", text: delta }));

          if (Date.now() - lastSavedAt > SAVE_INTERVAL_MS) {
            lastSavedAt = Date.now();
            await supabase.from("messages").update({ content: buffered }).eq("id", answerId);
          }
        }

        const { text, complete, reason } = await started.finish();
        const finalText = text.length > 0 ? text : buffered;
        const status = complete ? "completed" : "partial";

        const saved = await supabase
          .from("messages")
          .update({ content: finalText, status })
          .eq("id", answerId);
        if (saved.error) throw saved.error;

        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        controller.enqueue(line({ type: "done", status, reason: complete ? undefined : reason }));
      } catch (error) {
        console.error("스트리밍 중단:", error);
        // 받은 데까지는 남긴다. 실패를 완료로 표시하지 않는다.
        await supabase
          .from("messages")
          .update({
            content: buffered,
            status: buffered.length > 0 ? "partial" : "failed",
          })
          .eq("id", answerId);
        await started.finish(buffered);
        controller.enqueue(
          line({ type: "error", message: "답변이 도중에 끊겼다.", code: "stream_error" }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // 중간 프록시가 버퍼링하면 스트리밍의 의미가 사라진다.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function json(event: StreamEvent, status: number): Response {
  return new Response(JSON.stringify(event) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
