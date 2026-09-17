import { MEMORY_KINDS, type MemoryKind } from "@/src/server/memory/types";
import { ATTRIBUTIONS, type Attribution } from "@/src/server/memory/import-types";
import type { ValidationResult } from "./memory";

export type CreateImportInput = {
  /** 어디서 가져왔는지. 사용자가 직접 적는다. */
  sourceLabel: string;
  /** 붙여넣은 원문. */
  rawText: string;
};

const MAX_SOURCE_LABEL = 60;
const MAX_RAW_TEXT = 20_000;
const MIN_RAW_TEXT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCreateImport(body: unknown): ValidationResult<CreateImportInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "요청 본문이 객체가 아니다." };
  }
  const raw = body as Record<string, unknown>;

  const sourceLabel = typeof raw.sourceLabel === "string" ? raw.sourceLabel.trim() : "";
  if (sourceLabel.length === 0) return { ok: false, message: "출처가 비어 있다." };
  if (sourceLabel.length > MAX_SOURCE_LABEL) {
    return { ok: false, message: `출처가 너무 길다. (최대 ${MAX_SOURCE_LABEL}자)` };
  }

  const rawText = typeof raw.rawText === "string" ? raw.rawText.trim() : "";
  if (rawText.length < MIN_RAW_TEXT) {
    return { ok: false, message: `붙여넣은 내용이 너무 짧다. (최소 ${MIN_RAW_TEXT}자)` };
  }
  if (rawText.length > MAX_RAW_TEXT) {
    return { ok: false, message: `붙여넣은 내용이 너무 길다. (최대 ${MAX_RAW_TEXT}자)` };
  }

  return { ok: true, value: { sourceLabel, rawText } };
}

/**
 * 후보에 대한 사용자의 결정.
 *
 * 승인할 때 내용과 종류를 고칠 수 있다. 외부 AI가 정리한 문장을 그대로
 * 받아들여야 할 이유가 없다. 다만 근거(quote)는 고치지 못한다. 원문에서
 * 온 것이어야 하기 때문이다.
 */
export type CandidateDecision = {
  id: string;
  decision: "ACCEPT" | "REJECT";
  kind: MemoryKind | null;
  content: string | null;
};

const MAX_CONTENT = 1_000;
const MAX_DECISIONS = 100;

export function parseCandidateDecisions(body: unknown): ValidationResult<CandidateDecision[]> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "요청 본문이 객체가 아니다." };
  }
  const list = (body as Record<string, unknown>).decisions;
  if (!Array.isArray(list)) return { ok: false, message: "decisions가 배열이 아니다." };
  if (list.length === 0) return { ok: false, message: "결정할 후보가 없다." };
  if (list.length > MAX_DECISIONS) {
    return { ok: false, message: `한 번에 처리할 후보가 너무 많다. (최대 ${MAX_DECISIONS}개)` };
  }

  const parsed: CandidateDecision[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, message: "후보 결정이 객체가 아니다." };
    }
    const raw = item as Record<string, unknown>;

    const id = typeof raw.id === "string" ? raw.id : "";
    if (!UUID.test(id)) return { ok: false, message: "후보 id가 UUID 형식이 아니다." };
    // 같은 후보에 두 결정이 오면 어느 쪽을 따를지 정할 수 없다.
    if (seen.has(id)) return { ok: false, message: "같은 후보가 두 번 들어 있다." };
    seen.add(id);

    const decision = raw.decision;
    if (decision !== "ACCEPT" && decision !== "REJECT") {
      return { ok: false, message: "decision이 ACCEPT나 REJECT가 아니다." };
    }

    let kind: MemoryKind | null = null;
    if (raw.kind != null) {
      if (typeof raw.kind !== "string" || !MEMORY_KINDS.includes(raw.kind as MemoryKind)) {
        return { ok: false, message: "기억 종류가 올바르지 않다." };
      }
      kind = raw.kind as MemoryKind;
    }

    let content: string | null = null;
    if (raw.content != null) {
      if (typeof raw.content !== "string") {
        return { ok: false, message: "고친 내용이 문자열이 아니다." };
      }
      const trimmed = raw.content.trim();
      if (decision === "ACCEPT" && trimmed.length === 0) {
        return { ok: false, message: "승인할 기억의 내용이 비어 있다." };
      }
      if (trimmed.length > MAX_CONTENT) {
        return { ok: false, message: `기억 내용이 너무 길다. (최대 ${MAX_CONTENT}자)` };
      }
      content = trimmed.length > 0 ? trimmed : null;
    }

    parsed.push({ id, decision, kind, content });
  }

  return { ok: true, value: parsed };
}

/** 모델이 돌려준 후보 한 건. 아직 검증하지 않은 값이다. */
export type ExtractedCandidate = {
  kind: MemoryKind;
  content: string;
  attribution: Attribution;
  quote: string;
};

/**
 * 모델이 뱉은 JSON을 후보 목록으로 바꾼다.
 *
 * 모델 출력도 외부 입력이다. 형식이 틀린 항목은 버리고 남은 것만 쓴다.
 * 하나가 틀렸다고 전체를 버리면 사용자는 아무것도 얻지 못한다.
 *
 * 앞뒤에 설명이 붙어 오는 경우가 있어 첫 `[`부터 마지막 `]`까지만 읽는다.
 */
export function parseExtractedCandidates(
  text: string,
): { ok: true; value: ExtractedCandidate[]; dropped: number } | { ok: false; message: string } {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, message: "정리 결과를 읽지 못했다." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, message: "정리 결과를 읽지 못했다." };
  }
  if (!Array.isArray(parsed)) return { ok: false, message: "정리 결과가 목록이 아니다." };

  const value: ExtractedCandidate[] = [];
  let dropped = 0;

  for (const item of parsed) {
    if (typeof item !== "object" || item === null) {
      dropped++;
      continue;
    }
    const raw = item as Record<string, unknown>;

    const kind = typeof raw.kind === "string" ? raw.kind.toUpperCase() : "";
    const attribution = typeof raw.attribution === "string" ? raw.attribution.toUpperCase() : "";
    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    const quote = typeof raw.quote === "string" ? raw.quote.trim() : "";

    if (
      !MEMORY_KINDS.includes(kind as MemoryKind) ||
      !ATTRIBUTIONS.includes(attribution as Attribution) ||
      content.length === 0 ||
      content.length > MAX_CONTENT ||
      // 근거 없는 기억은 만들지 않는다(D31). 후보 단계에서도 같다.
      quote.length === 0
    ) {
      dropped++;
      continue;
    }

    value.push({
      kind: kind as MemoryKind,
      content,
      attribution: attribution as Attribution,
      quote: quote.slice(0, 2_000),
    });
  }

  return { ok: true, value, dropped };
}
