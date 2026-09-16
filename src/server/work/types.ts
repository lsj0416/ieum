export type WorkStatus = "ACTIVE" | "PAUSED" | "DONE";

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  ACTIVE: "진행 중",
  PAUSED: "보류",
  DONE: "완료",
};

export type WorkDecision = {
  id: string;
  decision: string;
  reason: string | null;
  status: "ACTIVE" | "SUPERSEDED";
  createdAt: string;
};

export type WorkItem = {
  id: string;
  title: string;
  goal: string | null;
  status: WorkStatus;
  nextAction: string | null;
  topicId: string | null;
  topicTitle: string | null;
  lastConfirmedAt: string;
  updatedAt: string;
};

export type WorkItemDetail = WorkItem & { decisions: WorkDecision[] };
