import type { MemoryKind } from "./types";

/**
 * 가져온 내용의 출처 구분.
 *
 * USER_STATEMENT: 원문에 사용자의 말·경험·선택으로 적혀 있다.
 * AI_INFERENCE: 외부 AI가 정리하면서 덧붙인 판단이다.
 *
 * 06 8절이 요구하는 구분이다. 둘을 섞으면 외부 AI의 추측이 사용자가 직접
 * 밝힌 사실로 승격된다. 승인 시 각각 memories.source의 USER와 MODEL이 된다.
 */
export const ATTRIBUTIONS = ["USER_STATEMENT", "AI_INFERENCE"] as const;
export type Attribution = (typeof ATTRIBUTIONS)[number];

export const ATTRIBUTION_LABELS: Record<Attribution, string> = {
  USER_STATEMENT: "사용자 발언",
  AI_INFERENCE: "AI 추정",
};

export type CandidateStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export type MemoryCandidate = {
  id: string;
  kind: MemoryKind;
  content: string;
  attribution: Attribution;
  /** 원문에서 이 후보가 나온 대목. */
  quote: string;
  /** 그 인용이 실제로 원문에 있었는가. 없으면 화면에서 경고한다. */
  quoteVerified: boolean;
  /** 민감 정보로 판정됐는가. 기본 선택에서 뺀다. */
  sensitive: boolean;
  status: CandidateStatus;
  memoryId: string | null;
};

export type MemoryImport = {
  id: string;
  sourceLabel: string;
  importedAt: string;
  status: "PENDING" | "REVIEWED";
  model: string | null;
  /**
   * 모델 답변이 출력 상한에 걸려 잘렸는가.
   *
   * 잘린 답변에서도 온전한 항목까지는 살린다. 그러나 살렸다는 사실을
   * 알리지 않으면 사용자는 그것이 전부인 줄 안다.
   */
  truncated: boolean;
  /** 원문. 후보의 근거를 눈으로 대조할 때 쓴다. */
  rawText: string;
};

export type MemoryImportWithCandidates = MemoryImport & { candidates: MemoryCandidate[] };

/**
 * 사용자가 기존 AI에 붙여넣을 정리용 프롬프트.
 *
 * 화면에서 그대로 복사해 쓴다. 여기서 형식을 정해두면 붙여넣은 결과에서
 * 근거를 뽑기 쉽고, 사용자 발언과 AI 추정의 구분도 원문에 남는다.
 *
 * 민감 정보를 애초에 만들지 말라고 프롬프트에서 먼저 막는다. 서버에서도
 * 한 번 더 거르지만, 만들지 않는 편이 낫다.
 */
export const IMPORT_PROMPT = `너는 내가 다른 AI 비서로 옮겨 가기 위해 나에 대한 정보를 정리하는 역할이다.
지금까지 나와 나눈 대화에서 확인된 내용만 사용해서 아래 형식으로 정리해줘.

각 항목을 한 줄씩, 다음 형식으로 적어줘.

[사실|선호|목표|사건] (사용자 발언|AI 추정) 내용 — 근거: 내가 했던 말이나 대화에서 확인된 대목

규칙:
- 내가 직접 말한 것은 "사용자 발언", 네가 대화에서 추측한 것은 "AI 추정"으로 표시해줘.
- 확인되지 않은 것은 적지 마. 빈칸을 메우려고 추측하지 마.
- 언제 기준인지 알 수 있으면 시점을 함께 적어줘. (예: 2026년 상반기 기준)
- 주민등록번호, 계좌·카드번호, 비밀번호, 집 주소, 건강·질병, 종교, 정치 성향은 적지 마.
- 정리만 해줘. 나에게 되묻거나 조언하지 마.

정리할 범위: 내 배경과 상황, 지금 하는 일, 목표, 진행 중인 프로젝트, 중요한 결정과 그 이유, 선호하는 작업 방식과 말투.`;
