/**
 * Built-in saved views. Client and server both read these, so they live
 * outside the server-only query module.
 */
export type PresetKey =
  | "due_today"
  | "overdue"
  | "hot"
  | "trials_ending"
  | "never_attempted"
  | "no_answer_3"
  | "unassigned";

export const PRESETS: Record<PresetKey, { label: string; description: string }> = {
  overdue: { label: "Overdue", description: "Follow-up date has passed" },
  due_today: { label: "Due today", description: "Follow-up lands today" },
  hot: { label: "Hot leads", description: "Marked hot and still open" },
  trials_ending: { label: "Trials ending in 2 days", description: "Demo week closing — call them" },
  never_attempted: { label: "Never attempted", description: "Zero dials logged" },
  no_answer_3: { label: "No answer 3+ times", description: "Dialled 3+ times, never connected" },
  unassigned: { label: "Unassigned", description: "Nobody owns these yet" },
};
