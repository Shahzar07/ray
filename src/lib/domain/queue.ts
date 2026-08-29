/** Why a lead surfaced in the Call Mode queue. Shared by client and server. */
export type QueueReason = "overdue" | "due_today" | "trial" | "hot" | "new";

export const REASON_ORDER: Record<QueueReason, number> = {
  overdue: 0,
  due_today: 1,
  trial: 2,
  hot: 3,
  new: 4,
};

export const REASON_LABEL: Record<QueueReason, string> = {
  overdue: "Overdue follow-up",
  due_today: "Due today",
  trial: "Demo week check-in",
  hot: "Hot lead, never attempted",
  new: "New lead",
};
