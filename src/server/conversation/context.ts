import type { ModelMessage } from "ai";

export type StoredMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** 모델에 함께 보낼 최근 대화의 최대 개수. */
const MAX_RECENT_MESSAGES = 20;

/**
 * 한글 기준 대략 1토큰 = 1.5자로 잡은 근사치.
 *
 * 정확한 토큰 수는 공급자의 tokenizer로만 알 수 있다. 여기서는 Context가
 * 무한히 커지는 것을 막는 것이 목적이므로 근사로 충분하다. 실제 사용량은
 * 호출 후 model_calls에 기록되므로, 이 근사가 빗나가도 비용은 정확히 남는다.
 */
const CHARS_PER_TOKEN = 1.5;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * 모델에 보낼 메시지를 만든다.
 *
 * 오래된 것부터 버리고 현재 질문은 절대 자르지 않는다. 문서 6절의 원칙이다.
 * 자른 사실은 호출자가 알 수 있게 함께 돌려준다.
 *
 * 시스템 원칙은 messages에 넣지 않고 따로 돌려준다. OpenAI의 현재 API는
 * messages 안의 system 역할을 거부하고 instructions로 받는다. AI SDK는
 * system 옵션이 그 자리에 대응한다.
 */
export function buildContext(params: {
  system: string;
  recent: StoredMessage[];
  current: string;
  maxInputTokens: number;
}): { system: string; messages: ModelMessage[]; droppedCount: number } {
  const { system, recent, current, maxInputTokens } = params;

  // 시스템 원칙과 현재 질문은 먼저 예산에서 뺀다. 둘은 줄일 수 없다.
  const fixed = estimateTokens(system) + estimateTokens(current);
  let budget = maxInputTokens - fixed;

  const candidates = recent.slice(-MAX_RECENT_MESSAGES);
  const kept: StoredMessage[] = [];

  // 최근 것부터 담고 예산이 떨어지면 멈춘다. 결과적으로 오래된 것이 빠진다.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const cost = estimateTokens(candidates[i].content);
    if (cost > budget) break;
    budget -= cost;
    kept.unshift(candidates[i]);
  }

  return {
    system,
    messages: [
      ...kept.map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
      { role: "user", content: current },
    ],
    droppedCount: recent.length - kept.length,
  };
}

/**
 * 비서의 기본 원칙.
 *
 * 문서 01의 4절과 7절을 옮긴 것이다. 기억·작업 상태가 붙는 S2~S3에서
 * 여기에 확정된 사실이 추가된다. 지금은 원칙만 있다.
 */
export const SYSTEM_PROMPT = [
  "너는 사용자 한 사람을 위한 개인 비서 ieum이다.",
  "모르는 것은 모른다고 말한다. 사용자의 개인 사실을 추측해서 만들어내지 않는다.",
  "확인하지 못한 사용자의 행동이나 상태를 알고 있는 것처럼 말하지 않는다.",
  "필요하면 반대 의견을 근거와 함께 말한다.",
  "수행하지 않은 일을 했다고 말하지 않는다.",
  "한국어로 답한다.",
].join("\n");
