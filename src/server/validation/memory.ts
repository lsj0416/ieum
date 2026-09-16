import { MEMORY_KINDS, type MemoryKind } from "@/src/server/memory/types";

export type CreateMemoryInput = {
  kind: MemoryKind;
  content: string;
  /** 근거가 된 인용. 대화에서 저장하면 그 발화, 직접 입력하면 입력 내용이다. */
  quote: string;
  sourceMessageId: string | null;
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

const MAX_CONTENT = 1_000;
const MAX_QUOTE = 2_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCreateMemory(body: unknown): ValidationResult<CreateMemoryInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "요청 본문이 객체가 아니다." };
  }
  const raw = body as Record<string, unknown>;

  const kind = raw.kind;
  if (typeof kind !== "string" || !MEMORY_KINDS.includes(kind as MemoryKind)) {
    return { ok: false, message: "기억 종류가 올바르지 않다." };
  }

  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (content.length === 0) return { ok: false, message: "기억 내용이 비어 있다." };
  if (content.length > MAX_CONTENT) {
    return { ok: false, message: `기억 내용이 너무 길다. (최대 ${MAX_CONTENT}자)` };
  }

  // 근거 없는 기억을 만들지 않는다. 이 단계의 완료 기준이 "출처가 있는 기억"이다.
  const quote = typeof raw.quote === "string" ? raw.quote.trim() : "";
  if (quote.length === 0) return { ok: false, message: "근거가 비어 있다." };
  if (quote.length > MAX_QUOTE) {
    return { ok: false, message: `근거가 너무 길다. (최대 ${MAX_QUOTE}자)` };
  }

  const sourceMessageId = raw.sourceMessageId;
  if (sourceMessageId != null && (typeof sourceMessageId !== "string" || !UUID.test(sourceMessageId))) {
    return { ok: false, message: "sourceMessageId가 UUID 형식이 아니다." };
  }

  return {
    ok: true,
    value: { kind: kind as MemoryKind, content, quote, sourceMessageId: sourceMessageId ?? null },
  };
}
