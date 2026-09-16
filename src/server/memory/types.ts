/** 기억의 종류. 모두 '장기 기억' 하나로 취급하지 않는다. */
export const MEMORY_KINDS = ["FACT", "PREFERENCE", "GOAL", "EPISODE"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const KIND_LABELS: Record<MemoryKind, string> = {
  FACT: "사실",
  PREFERENCE: "선호",
  GOAL: "목표",
  EPISODE: "사건",
};

export const KIND_HINTS: Record<MemoryKind, string> = {
  FACT: "바뀌기 전까지 유효한 사실. 예: Java 백엔드 개발을 준비한다",
  PREFERENCE: "응답 방식에 대한 선호. 예: 코드 예시를 먼저 보여주면 좋다",
  GOAL: "이루려는 것. 여러 개가 동시에 살아 있을 수 있다",
  EPISODE: "특정 시점의 사건. 예: 2026-09-16에 첫 배포를 마쳤다",
};

export type MemoryStatus = "ACTIVE" | "SUPERSEDED" | "DELETED";

export type Memory = {
  id: string;
  /** 낙관적 잠금용. 고칠 때 이 값을 함께 보낸다. */
  version: number;
  kind: MemoryKind;
  content: string;
  source: "USER" | "MODEL";
  status: MemoryStatus;
  supersedesId: string | null;
  validFrom: string;
  validUntil: string | null;
  updatedAt: string;
};

export type MemoryEvidence = {
  id: string;
  quote: string;
  sourceKind: "CHAT" | "MANUAL";
  sourceMessageId: string | null;
};

export type MemoryWithEvidence = Memory & { evidence: MemoryEvidence[] };
