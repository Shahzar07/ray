import type {
  ActivityType,
  CallOutcome,
  InterestLevel,
  LeadStatus,
  Role,
  TrialStatus,
} from "@/lib/db/schema";

/**
 * The product name, in one place so renaming it is a one-line change rather
 * than a hunt through the UI.
 *
 * Two forms on purpose. `APP_NAME` is the identity — window titles, the
 * wordmark, the installed app, anywhere the user is being told what this is.
 * `APP_SHORT_NAME` is for body copy and chips, where the full name is simply
 * too long to sit inside a badge without wrapping it ("3 already in
 * Raynaters Call Desk" reads badly and breaks the layout).
 */
export const APP_NAME = "Raynaters Call Desk";
export const APP_SHORT_NAME = "Call Desk";

/**
 * One colour map for the whole app. Every badge, chart series, kanban column
 * and progress ring reads from here — no ad-hoc colours anywhere else.
 * `tone` maps onto the semantic token pairs defined in globals.css.
 */
export type Tone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-inset text-muted ring-line",
  info: "bg-info-soft text-info-text ring-info/25",
  accent: "bg-accent-soft text-accent-text ring-accent/25",
  success: "bg-success-soft text-success-text ring-success/25",
  warning: "bg-warning-soft text-warning-text ring-warning/30",
  danger: "bg-danger-soft text-danger-text ring-danger/25",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-subtle",
  info: "bg-info",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export const TONE_HEX: Record<Tone, string> = {
  neutral: "var(--text-subtle)",
  info: "var(--info)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

type Meta = { label: string; tone: Tone; short?: string };

export const LEAD_STATUS: Record<LeadStatus, Meta> = {
  new: { label: "New", tone: "neutral" },
  attempted: { label: "Attempted", tone: "neutral" },
  connected: { label: "Connected", tone: "info" },
  interested: { label: "Interested", tone: "accent" },
  demo_scheduled: { label: "Demo scheduled", tone: "accent", short: "Demo set" },
  trial_active: { label: "Trial active", tone: "warning", short: "In trial" },
  converted: { label: "Converted", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
  not_interested: { label: "Not interested", tone: "danger", short: "Not int." },
  wrong_number: { label: "Wrong number", tone: "danger", short: "Wrong no." },
  callback_later: { label: "Callback later", tone: "info", short: "Callback" },
  do_not_call: { label: "Do not call", tone: "danger", short: "DNC" },
};

/** Pipeline order — drives the kanban board and the funnel chart. */
export const PIPELINE_ORDER: LeadStatus[] = [
  "new",
  "attempted",
  "connected",
  "interested",
  "demo_scheduled",
  "trial_active",
  "converted",
];

export const CLOSED_STATUSES: LeadStatus[] = [
  "lost",
  "not_interested",
  "wrong_number",
  "do_not_call",
];

export const INTEREST_LEVEL: Record<InterestLevel, Meta> = {
  hot: { label: "Hot", tone: "danger" },
  warm: { label: "Warm", tone: "warning" },
  cold: { label: "Cold", tone: "info" },
};

export const TRIAL_STATUS: Record<TrialStatus, Meta> = {
  none: { label: "No trial", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  active: { label: "Active", tone: "accent" },
  ended_pending: { label: "Pending decision", tone: "warning", short: "Pending" },
  converted: { label: "Converted", tone: "success" },
  churned: { label: "Churned", tone: "danger" },
};

export const CALL_OUTCOME: Record<CallOutcome, Meta> = {
  answered: { label: "Answered", tone: "success" },
  no_answer: { label: "No answer", tone: "neutral" },
  busy: { label: "Busy", tone: "warning" },
  voicemail: { label: "Voicemail", tone: "info" },
  wrong_number: { label: "Wrong number", tone: "danger" },
  hung_up: { label: "Hung up", tone: "danger" },
  gatekeeper: { label: "Gatekeeper", tone: "warning" },
};

export const ACTIVITY_TYPE: Record<ActivityType, Meta> = {
  call: { label: "Call", tone: "info" },
  note: { label: "Note", tone: "neutral" },
  status_change: { label: "Status change", tone: "accent" },
  assignment: { label: "Assignment", tone: "neutral" },
  follow_up_set: { label: "Follow-up set", tone: "warning" },
  field_change: { label: "Field change", tone: "neutral" },
  import: { label: "Imported", tone: "neutral" },
  whatsapp: { label: "WhatsApp", tone: "success" },
  email: { label: "Email", tone: "info" },
  trial_event: { label: "Trial", tone: "accent" },
};

export const ROLE: Record<Role, Meta> = {
  owner: { label: "Owner", tone: "accent" },
  team_lead: { label: "Team lead", tone: "info" },
  agent: { label: "Agent", tone: "neutral" },
};

export const LEAD_SOURCE = {
  scraped: "Scraped",
  referral: "Referral",
  inbound: "Inbound",
  ad: "Ad",
  other: "Other",
} as const;

export const LOST_REASON = {
  price: "Price",
  no_need: "No need",
  competitor: "Competitor",
  unreachable: "Unreachable",
  bad_timing: "Bad timing",
  other: "Other",
} as const;

export const FOLLOW_UP_CHANNEL = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
} as const;

export const TRIAL_LENGTH_DAYS = 7;

/** Chart series palette — distinct in both themes, colour-blind safe ordering. */
export const SERIES_COLORS = [
  "var(--accent)",
  "var(--success)",
  "var(--warning)",
  "var(--info)",
  "var(--danger)",
  "oklch(0.62 0.16 320)",
  "oklch(0.66 0.13 200)",
  "oklch(0.58 0.14 40)",
];

export function statusMeta(status: LeadStatus): Meta {
  return LEAD_STATUS[status];
}
