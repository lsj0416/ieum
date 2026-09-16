/**
 * 요청 본문 검증.
 *
 * 외부에서 들어온 값은 타입이 없다고 보고 하나씩 확인한다. TypeScript의
 * 타입은 컴파일 시점에만 있고 런타임 요청에는 아무 보장을 주지 않는다.
 * Java에서 @Valid로 DTO를 검증하던 자리와 같다.
 */

export type SendMessageInput = {
  /** 이어갈 대화. 없으면 새 대화를 만든다. */
  conversationId: string | null;
  content: string;
  /** 같은 요청이 두 번 도착해도 한 번만 저장되게 하는 키. */
  clientRequestId: string;
};

export type ValidationResult =
  | { ok: true; value: SendMessageInput }
  | { ok: false; message: string };

const MAX_CONTENT_LENGTH = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSendMessage(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "요청 본문이 객체가 아니다." };
  }
  const raw = body as Record<string, unknown>;

  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (content.length === 0) return { ok: false, message: "메시지가 비어 있다." };
  if (content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, message: `메시지가 너무 길다. (최대 ${MAX_CONTENT_LENGTH}자)` };
  }

  const clientRequestId = typeof raw.clientRequestId === "string" ? raw.clientRequestId : "";
  if (!UUID.test(clientRequestId)) {
    return { ok: false, message: "clientRequestId가 UUID 형식이 아니다." };
  }

  const conversationIdRaw = raw.conversationId;
  if (conversationIdRaw != null && typeof conversationIdRaw !== "string") {
    return { ok: false, message: "conversationId 형식이 올바르지 않다." };
  }
  if (typeof conversationIdRaw === "string" && !UUID.test(conversationIdRaw)) {
    return { ok: false, message: "conversationId가 UUID 형식이 아니다." };
  }

  return {
    ok: true,
    value: { conversationId: conversationIdRaw ?? null, content, clientRequestId },
  };
}
