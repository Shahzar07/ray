import { z } from "zod";
import { MAX_IMPORT_ROWS } from "@/lib/domain/import";

/** Every input boundary in the app is one of these. Nothing is trusted client-side. */

export const leadStatusSchema = z.enum([
  "new",
  "attempted",
  "connected",
  "interested",
  "demo_scheduled",
  "trial_active",
  "converted",
  "lost",
  "not_interested",
  "wrong_number",
  "callback_later",
  "do_not_call",
]);

export const interestLevelSchema = z.enum(["hot", "warm", "cold"]);
export const lostReasonSchema = z.enum(["price", "no_need", "competitor", "unreachable", "bad_timing", "other"]);
export const followUpChannelSchema = z.enum(["call", "whatsapp", "email"]);
export const callOutcomeSchema = z.enum([
  "answered",
  "no_answer",
  "busy",
  "voicemail",
  "wrong_number",
  "hung_up",
  "gatekeeper",
]);
export const roleSchema = z.enum(["owner", "team_lead", "agent"]);
export const leadSourceSchema = z.enum(["scraped", "referral", "inbound", "ad", "other"]);

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}([T ].*)?$/))
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), "Not a valid date");

export const updateLeadSchema = z.object({
  leadId: z.string().uuid(),
  status: leadStatusSchema.optional(),
  interestLevel: interestLevelSchema.nullable().optional(),
  lostReason: lostReasonSchema.nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  nextFollowUpAt: isoDate.nullable().optional(),
  followUpChannel: followUpChannelSchema.nullable().optional(),
  followUpNote: z.string().max(500).nullable().optional(),
  fullName: z.string().min(1).max(160).optional(),
  company: z.string().max(160).nullable().optional(),
  jobTitle: z.string().max(160).nullable().optional(),
  email: z.string().email().nullable().or(z.literal("")).optional(),
  website: z.string().max(300).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  phoneAlt: z.string().max(40).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  isArchived: z.boolean().optional(),
});

export const logCallSchema = z.object({
  leadId: z.string().uuid(),
  outcome: callOutcomeSchema,
  note: z.string().max(4000).optional(),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 4).optional(),
  interestLevel: interestLevelSchema.nullable().optional(),
  status: leadStatusSchema.optional(),
  nextFollowUpAt: isoDate.nullable().optional(),
  followUpChannel: followUpChannelSchema.nullable().optional(),
  startTrial: z.boolean().optional(),
  demoScheduledAt: isoDate.nullable().optional(),
});

export const addNoteSchema = z.object({
  leadId: z.string().uuid(),
  body: z.string().min(1, "Write something first").max(4000),
  aiGenerated: z.boolean().optional(),
});

export const bulkActionSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["status", "assign", "tag", "untag", "follow_up", "archive", "unarchive", "dnc"]),
  status: leadStatusSchema.optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  tag: z.string().min(1).max(40).optional(),
  nextFollowUpAt: isoDate.nullable().optional(),
});

export const trialActionSchema = z.object({
  leadId: z.string().uuid(),
  action: z.enum(["schedule", "start", "convert", "churn", "cancel"]),
  scheduledAt: isoDate.optional(),
  note: z.string().max(1000).optional(),
});

export const createLeadSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(160),
  phonePrimary: z.string().min(5, "Phone number is required").max(40),
  company: z.string().max(160).optional(),
  jobTitle: z.string().max(160).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  city: z.string().max(120).optional(),
  source: leadSourceSchema.default("scraped"),
  assignedTo: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: roleSchema,
  teamId: z.string().uuid(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1, "Tell us your name").max(120),
  password: z.string().min(8, "At least 8 characters"),
  timezone: z.string().max(64).default("Asia/Karachi"),
});

export const signupOwnerSchema = z.object({
  orgName: z.string().min(1, "Name your company").max(120),
  teamName: z.string().min(1).max(120).default("Sales"),
  name: z.string().min(1, "Your name").max(120),
  email: z.string().email(),
  password: z.string().min(8, "At least 8 characters"),
  timezone: z.string().max(64).default("Asia/Karachi"),
});

export const visibilityLinkSchema = z.object({
  teamId: z.string().uuid(),
  viewerUserId: z.string().uuid(),
  targetUserId: z.string().uuid(),
});

export const dncSchema = z.object({
  phone: z.string().min(5).max(40),
  reason: z.string().max(300).optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  timezone: z.string().max(64),
});

export const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "At least 8 characters"),
    confirm: z.string().min(8),
  })
  .refine((v) => v.next === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const targetsSchema = z.object({
  membershipId: z.string().uuid(),
  dailyDialTarget: z.number().int().min(0).max(500),
  dailyConnectTarget: z.number().int().min(0).max(500),
});

export const customFieldSchema = z.object({
  id: z.string().uuid().optional(),
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Lowercase letters, numbers and underscores"),
  label: z.string().min(1).max(60),
  fieldType: z.enum(["text", "number", "date", "select", "multiselect", "boolean"]),
  options: z.array(z.string().max(60)).max(40).default([]),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/* ------------------------------ Importer ----------------------------- */

/**
 * The sheet arrives as raw cells plus a mapping, and the server re-derives
 * every lead field from them. The client's own preview is a convenience; this
 * is the boundary that decides what actually gets written.
 */
const cellSchema = z.string().max(500);

export const importPreviewSchema = z.object({
  headers: z.array(z.string().max(120)).min(1, "That sheet has no header row").max(80),
  rows: z
    .array(z.array(cellSchema).max(80))
    .min(1, "That sheet has no data rows")
    .max(MAX_IMPORT_ROWS, `Split the sheet — ${MAX_IMPORT_ROWS.toLocaleString()} rows is the most one import can take`),
  mapping: z.array(z.string().max(60).nullable()).max(80),
});

export const runImportSchema = importPreviewSchema.extend({
  filename: z.string().min(1).max(200),
  source: leadSourceSchema.default("scraped"),
  sourceNote: z.string().max(300).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  strategy: z.enum(["single", "round_robin", "by_column"]).default("single"),
  assignUserIds: z.array(z.string().uuid()).max(50).default([]),
  duplicateAction: z.enum(["skip", "update"]).default("skip"),
  dncAction: z.enum(["skip", "import_flagged"]).default("skip"),
});
