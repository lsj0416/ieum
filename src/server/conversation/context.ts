import type { ModelMessage } from "ai";

export type StoredMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** Context에 넣을 기억. 삭제되거나 닫힌 기억은 여기까지 오지 않는다. */
export type ContextMemory = {
  id: string;
  kind: "FACT" | "PREFERENCE" | "GOAL" | "EPISODE";
  content: string;
};

/** 진행 중인 일. 마지막 결정과 다음 행동을 함께 전달한다. */
export type ContextWork = {
  id: string;
  title: string;
  status: "ACTIVE" | "PAUSED" | "DONE";
  nextAction: string | null;
  lastDecision: string | null;
  lastConfirmedAt: string;
};

/** 기억에 쓸 수 있는 입력 예산의 비율. 나머지는 최근 대화 몫이다. */
const MEMORY_BUDGET_RATIO = 0.4;

/** 진행 중인 일에 쓸 수 있는 비율. 기억과 마찬가지로 대화 몫을 남긴다. */
const WORK_BUDGET_RATIO = 0.2;

/** 이 시간이 지난 상태는 "마지막 확인 시점"을 함께 밝힌다(E09). */
const STALE_WORK_MS = 7 * 24 * 60 * 60 * 1000;

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
  memories: ContextMemory[];
  work: ContextWork[];
  recent: StoredMessage[];
  current: string;
  maxInputTokens: number;
}): {
  system: string;
  messages: ModelMessage[];
  droppedCount: number;
  /** 실제로 모델에 전달한 기억. 화면에서 확인할 수 있어야 한다(문서 6절). */
  usedMemories: ContextMemory[];
  /** 실제로 전달한 진행 중인 일. */
  usedWork: ContextWork[];
} {
  const { system, memories, work, recent, current, maxInputTokens } = params;

  // 시스템 원칙과 현재 질문은 먼저 예산에서 뺀다. 둘은 줄일 수 없다.
  const fixed = estimateTokens(system) + estimateTokens(current);
  let budget = maxInputTokens - fixed;

  // 기억이 예산을 다 먹으면 최근 대화가 사라져 대화가 끊긴다. 몫을 나눈다.
  // 기억이 적으면 남는 몫은 그대로 최근 대화가 쓴다.
  const usedMemories: ContextMemory[] = [];
  let memoryBudget = Math.floor(budget * MEMORY_BUDGET_RATIO);
  for (const memory of memories) {
    const cost = estimateTokens(memory.content) + 8; // 종류 표시와 줄바꿈 몫
    if (cost > memoryBudget) break;
    memoryBudget -= cost;
    usedMemories.push(memory);
    budget -= cost;
  }

  // 진행 중인 일도 몫을 나눠 담는다. 완료한 일은 애초에 여기 오지 않는다.
  const usedWork: ContextWork[] = [];
  let workBudget = Math.floor(budget * WORK_BUDGET_RATIO);
  for (const item of work) {
    const cost =
      estimateTokens(item.title) +
      estimateTokens(item.nextAction ?? "") +
      estimateTokens(item.lastDecision ?? "") +
      16;
    if (cost > workBudget) break;
    workBudget -= cost;
    usedWork.push(item);
    budget -= cost;
  }

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
    // 기억은 대화가 아니라 시스템 지시에 붙인다. 사용자 발화로 넣으면
    // 모델이 "방금 사용자가 한 말"로 오해할 수 있다.
    system: [
      system,
      usedMemories.length > 0 ? renderMemories(usedMemories) : null,
      usedWork.length > 0 ? renderWork(usedWork) : null,
    ]
      .filter((part): part is string => part !== null)
      .join("\n\n"),
    messages: [
      ...kept.map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
      { role: "user", content: current },
    ],
    droppedCount: recent.length - kept.length,
    usedMemories,
    usedWork,
  };
}

const WORK_STATUS_TEXT: Record<ContextWork["status"], string> = {
  ACTIVE: "진행 중",
  PAUSED: "보류",
  DONE: "완료",
};

/**
 * 진행 중인 일을 시스템 지시에 붙일 형태로 만든다.
 *
 * 여러 일이 있으면 어느 것인지 임의로 고르지 말라고 함께 적는다. 문서 6절이
 * "애매한 '그 일'에 대해 임의로 작업을 확정하지 않는다"고 요구한다(E07).
 *
 * 오래 확인하지 않은 상태에는 마지막 확인 시점을 붙인다. 지금도 그런지
 * 모르면서 단정하지 않게 한다(E09).
 */
function renderWork(items: ContextWork[]): string {
  const now = Date.now();
  const lines = items.map((item) => {
    const parts = [`- [${WORK_STATUS_TEXT[item.status]}] ${item.title}`];
    if (item.lastDecision) parts.push(`  마지막 결정: ${item.lastDecision}`);
    if (item.nextAction) parts.push(`  다음 행동: ${item.nextAction}`);
    if (now - new Date(item.lastConfirmedAt).getTime() > STALE_WORK_MS) {
      parts.push(`  (${item.lastConfirmedAt.slice(0, 10)} 이후 확인하지 않은 상태다)`);
    }
    return parts.join("\n");
  });

  return [
    "아래는 사용자가 진행 중인 일이다. 완료한 일은 여기 없다.",
    ...lines,
    "",
    "여러 일이 있으면 어느 것을 말하는지 임의로 정하지 말고 확인한다.",
    "오래 확인하지 않은 상태는 지금도 그런지 단정하지 않는다.",
  ].join("\n");
}

const KIND_LABEL: Record<ContextMemory["kind"], string> = {
  FACT: "사실",
  PREFERENCE: "선호",
  GOAL: "목표",
  EPISODE: "사건",
};

/**
 * 기억을 시스템 지시에 붙일 형태로 만든다.
 *
 * 이 기억들이 확인된 것임을 밝히되, 여기 없는 것을 추측하지 말라고
 * 함께 적는다. 목록을 주면 모델은 그 사이를 메우려 든다.
 */
function renderMemories(memories: ContextMemory[]): string {
  const lines = memories.map((m) => `- [${KIND_LABEL[m.kind]}] ${m.content}`);
  return [
    "아래는 사용자가 직접 등록해 확인된 기억이다.",
    ...lines,
    "",
    "여기 없는 개인 정보는 모른다고 말한다. 목록을 메우려고 추측하지 않는다.",
  ].join("\n");
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
