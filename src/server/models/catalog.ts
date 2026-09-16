/**
 * 작업별 모델 매핑과 단가.
 *
 * 코드는 모델 ID가 아니라 작업 이름("chat")을 부른다. 모델을 바꿀 때
 * 호출부를 고치지 않기 위해서다. 문서의 D07·D10이 말하는 "모델은 교체
 * 가능한 추론 엔진"이 이 파일에서 지켜진다.
 */

/** 모델을 부르는 용도. 새 작업이 생기면 여기에 추가한다. */
export type ModelTask = "chat";

export type ModelPricing = {
  /** 1M 토큰당 USD. 캐시 읽기·쓰기는 일반 입력과 단가가 다르다. */
  inputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
  outputPerMillion: number;
};

export type ModelSpec = {
  id: string;
  pricing: ModelPricing;
  /** 이 시각 기준의 단가다. 공급자 단가는 바뀌므로 확인 날짜를 남긴다. */
  pricingCheckedOn: string;
};

/**
 * 2026-09-16 확인. platform.openai.com/docs/pricing 의 short context 기준.
 * 단가가 바뀌면 이 값과 확인 날짜를 함께 고친다.
 *
 * 개발·테스트 중에는 luna를 쓴다. terra의 10분의 1 가격이라 같은 예산으로
 * 열 배 더 시험해볼 수 있다. 답변 품질을 실제로 비교한 뒤 정할 일이므로,
 * 바꿀 때는 아래 id와 pricing을 함께 고친다.
 *
 * terra 단가(참고): 입력 $2.00 / 캐시 읽기 $0.20 / 캐시 쓰기 $2.50 / 출력 $12.00
 */
export const MODELS: Record<ModelTask, ModelSpec> = {
  chat: {
    id: "gpt-5.6-luna",
    pricing: {
      inputPerMillion: 0.2,
      cacheReadPerMillion: 0.02,
      cacheWritePerMillion: 0.25,
      outputPerMillion: 1.2,
    },
    pricingCheckedOn: "2026-09-16",
  },
};

/**
 * 입력 토큰은 세 종류로 나뉘고 각각 단가가 다르다.
 * 셋을 더하면 공급자가 말하는 전체 입력 토큰이 된다.
 */
export type TokenUsage = {
  /** 캐시에 걸리지 않은 일반 입력. */
  freshInputTokens: number;
  /** 캐시에서 읽은 입력. 가장 싸다. */
  cacheReadTokens: number;
  /** 캐시에 쓴 입력. 일반 입력보다 비싸다. */
  cacheWriteTokens: number;
  outputTokens: number;
};

/** 기록과 예산 표시에 쓰는 전체 입력 토큰 수. */
export function totalInputTokens(usage: TokenUsage): number {
  return usage.freshInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

/**
 * 호출 시점 단가로 비용을 계산한다.
 *
 * 세 종류의 입력 토큰은 서로 겹치지 않으므로 각각의 단가로 더하면 된다.
 */
export function estimateCostUsd(task: ModelTask, usage: TokenUsage): number {
  const { pricing } = MODELS[task];

  const usd =
    (usage.freshInputTokens / 1_000_000) * pricing.inputPerMillion +
    (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion +
    (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;

  // DB의 numeric(12,6)에 맞춰 자른다.
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** 월 예산 상한(USD). 초과하면 호출을 막는다. */
export const MONTHLY_BUDGET_USD = 30;

/**
 * 한 번의 호출이 기다릴 수 있는 최대 시간.
 *
 * 60초로 두었더니 긴 답변이 매번 중간에 잘렸다. 생성 속도가 초당 70자
 * 남짓이라 네 문단만 넘어가도 걸린다.
 *
 * Vercel Hobby의 함수 실행 상한이 300초이므로 그보다 낮게 잡는다.
 * 여기서 끊는 편이 플랫폼이 끊는 것보다 낫다. 우리가 끊으면 받은 데까지
 * 저장하고 사용량을 남길 수 있다.
 */
export const MODEL_TIMEOUT_MS = 180_000;

/** 초기 Context 예산. 문서 P04의 출발 제안값에서 조정했다. */
export const MAX_INPUT_TOKENS = 6_000;

/**
 * 출력 상한.
 *
 * 처음에 1,000으로 두었더니 조금 긴 설명이 매번 잘려 "도중에 끊겼다"가
 * 떴다. 한국어는 같은 내용에 영어보다 토큰을 더 쓴다.
 *
 * luna 기준 4,000토큰을 다 쓰면 한 턴 출력 비용이 $0.0048이다. 월 $30
 * 상한에서 6,000턴이 넘고, 실제로는 대부분의 답변이 이보다 훨씬 짧다.
 */
export const MAX_OUTPUT_TOKENS = 4_000;
