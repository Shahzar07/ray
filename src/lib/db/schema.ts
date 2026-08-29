import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("role", ["owner", "team_lead", "agent"]);

export const leadStatusEnum = pgEnum("lead_status", [
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

export const interestLevelEnum = pgEnum("interest_level", ["hot", "warm", "cold"]);

export const lostReasonEnum = pgEnum("lost_reason", [
  "price",
  "no_need",
  "competitor",
  "unreachable",
  "bad_timing",
  "other",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "scraped",
  "referral",
  "inbound",
  "ad",
  "other",
]);

export const trialStatusEnum = pgEnum("trial_status", [
  "none",
  "scheduled",
  "active",
  "ended_pending",
  "converted",
  "churned",
]);

export const followUpChannelEnum = pgEnum("follow_up_channel", ["call", "whatsapp", "email"]);

export const activityTypeEnum = pgEnum("activity_type", [
  "call",
  "note",
  "status_change",
  "assignment",
  "follow_up_set",
  "field_change",
  "import",
  "whatsapp",
  "email",
  "trial_event",
]);

export const callOutcomeEnum = pgEnum("call_outcome", [
  "answered",
  "no_answer",
  "busy",
  "voicemail",
  "wrong_number",
  "hung_up",
  "gatekeeper",
]);

export const assignmentStrategyEnum = pgEnum("assignment_strategy", [
  "single",
  "round_robin",
  "by_column",
]);

export const importStatusEnum = pgEnum("import_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "select",
  "multiselect",
  "boolean",
]);

/* ------------------------------------------------------------------ */
/* Core hierarchy                                                      */
/* ------------------------------------------------------------------ */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  /* Calling window in lead-local time, used by Call Mode queue ordering. */
  callingWindowStart: integer("calling_window_start").notNull().default(9),
  callingWindowEnd: integer("calling_window_end").notNull().default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("emailVerified", { withTimezone: true }),
    image: text("image"),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("Asia/Karachi"),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/* Auth.js adapter tables */
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("teams_org_idx").on(t.orgId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("agent"),
    dailyDialTarget: integer("daily_dial_target").notNull().default(60),
    dailyConnectTarget: integer("daily_connect_target").notNull().default(12),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_team_user_uq").on(t.teamId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/**
 * Directional lead-visibility grant: `viewer` may see leads assigned to `target`
 * within `team`. One row grants exactly one direction.
 */
export const leadVisibilityLinks = pgTable(
  "lead_visibility_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    viewerUserId: uuid("viewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lvl_team_viewer_target_uq").on(t.teamId, t.viewerUserId, t.targetUserId),
    index("lvl_viewer_idx").on(t.viewerUserId, t.teamId),
  ],
);

/* ------------------------------------------------------------------ */
/* Imports                                                             */
/* ------------------------------------------------------------------ */

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    columnMapping: jsonb("column_mapping").$type<Record<string, string>>().notNull().default({}),
    assignmentStrategy: assignmentStrategyEnum("assignment_strategy").notNull().default("single"),
    status: importStatusEnum("status").notNull().default("pending"),
    errorLog: jsonb("error_log").$type<Array<{ row: number; message: string }>>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batches_team_idx").on(t.teamId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),

    fullName: text("full_name").notNull(),
    company: text("company"),
    jobTitle: text("job_title"),
    phonePrimary: text("phone_primary").notNull(),
    phoneAlt: text("phone_alt"),
    email: text("email"),
    website: text("website"),
    city: text("city"),
    country: text("country"),
    timezone: text("timezone"),

    source: leadSourceEnum("source").notNull().default("scraped"),
    sourceBatchId: uuid("source_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    sourceNote: text("source_note"),

    status: leadStatusEnum("status").notNull().default("new"),
    interestLevel: interestLevelEnum("interest_level"),
    lostReason: lostReasonEnum("lost_reason"),

    demoScheduledAt: timestamp("demo_scheduled_at", { withTimezone: true }),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    trialStatus: trialStatusEnum("trial_status").notNull().default("none"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),

    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    followUpChannel: followUpChannelEnum("follow_up_channel"),
    followUpNote: text("follow_up_note"),
    followUpCount: integer("follow_up_count").notNull().default(0),

    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    attemptsCount: integer("attempts_count").notNull().default(0),
    connectsCount: integer("connects_count").notNull().default(0),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    /* 0-100 statistical likelihood-to-convert; drives Call Mode ordering. */
    score: integer("score").notNull().default(50),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default({}),
    isArchived: boolean("is_archived").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_team_assignee_status_idx").on(t.teamId, t.assignedTo, t.status),
    index("leads_assignee_followup_idx").on(t.assignedTo, t.nextFollowUpAt),
    uniqueIndex("leads_org_phone_uq").on(t.orgId, t.phonePrimary),
    index("leads_team_updated_idx").on(t.teamId, t.updatedAt),
    index("leads_trial_idx").on(t.teamId, t.trialStatus, t.trialEndsAt),
    index("leads_tags_gin").using("gin", t.tags),
    index("leads_custom_fields_gin").using("gin", t.customFields),
  ],
);

/* Append-only. Never updated, never deleted. */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: activityTypeEnum("type").notNull(),
    callOutcome: callOutcomeEnum("call_outcome"),
    durationSeconds: integer("duration_seconds"),
    body: text("body"),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_lead_idx").on(t.leadId, t.createdAt.desc()),
    index("activities_user_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export const doNotCall = pgTable(
  "do_not_call",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    reason: text("reason"),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dnc_org_phone_uq").on(t.orgId, t.phone)],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    sort: jsonb("sort").$type<Record<string, unknown>>().notNull().default({}),
    visibleColumns: jsonb("visible_columns").$type<string[]>().notNull().default([]),
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_views_team_idx").on(t.teamId, t.userId)],
);

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    fieldType: customFieldTypeEnum("field_type").notNull().default("text"),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("cfd_org_key_uq").on(t.orgId, t.key)],
);

export const dailyStats = pgTable(
  "daily_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    dials: integer("dials").notNull().default(0),
    answered: integer("answered").notNull().default(0),
    interested: integer("interested").notNull().default(0),
    demosScheduled: integer("demos_scheduled").notNull().default(0),
    trialsStarted: integer("trials_started").notNull().default(0),
    converted: integer("converted").notNull().default(0),
    lost: integer("lost").notNull().default(0),
    notesAdded: integer("notes_added").notNull().default(0),
    followUpsCompleted: integer("follow_ups_completed").notNull().default(0),
  },
  (t) => [
    uniqueIndex("daily_stats_user_date_uq").on(t.userId, t.date),
    index("daily_stats_team_date_idx").on(t.teamId, t.date),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.isRead, t.createdAt)],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("agent"),
    token: text("token").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invites_token_uq").on(t.token), index("invites_team_idx").on(t.teamId)],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  leads: many(leads),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  org: one(organizations, { fields: [teams.orgId], references: [organizations.id] }),
  memberships: many(memberships),
  leads: many(leads),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  team: one(teams, { fields: [memberships.teamId], references: [teams.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  team: one(teams, { fields: [leads.teamId], references: [teams.id] }),
  assignee: one(users, { fields: [leads.assignedTo], references: [users.id] }),
  batch: one(importBatches, { fields: [leads.sourceBatchId], references: [importBatches.id] }),
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  lead: one(leads, { fields: [activities.leadId], references: [leads.id] }),
  user: one(users, { fields: [activities.userId], references: [users.id] }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];
export type InterestLevel = (typeof interestLevelEnum.enumValues)[number];
export type TrialStatus = (typeof trialStatusEnum.enumValues)[number];
export type CallOutcome = (typeof callOutcomeEnum.enumValues)[number];
export type ActivityType = (typeof activityTypeEnum.enumValues)[number];
