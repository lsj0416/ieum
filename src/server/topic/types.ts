export type TopicStatus = "CANDIDATE" | "ACTIVE" | "ARCHIVED";

export type Topic = {
  id: string;
  title: string;
  source: "MANUAL" | "AUTO";
  status: TopicStatus;
  version: number;
  lastActivityAt: string;
};

/** 주제에 연결된 대화 구간. 원문은 그대로 두고 참조만 모은다. */
export type TopicSegment = {
  segmentId: string;
  conversationId: string;
  conversationTitle: string | null;
  startSeq: number;
  endSeq: number;
  decision: "INCLUDE" | "EXCLUDE";
  source: "MANUAL" | "AUTO";
  /** 구간의 첫 메시지 일부. 어떤 대화였는지 알아볼 수 있게 한다. */
  preview: string;
};

export type TopicDetail = Topic & {
  segments: TopicSegment[];
  /** 이 주제에서 마지막으로 쓴 대화. '이 주제로 대화'가 제안한다. */
  lastConversationId: string | null;
};
