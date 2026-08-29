import "server-only";
import { addDays, formatISO } from "date-fns";
import { z } from "zod";
import { askAI, type AiResult } from "./client";
import {
  followUpChannelSchema,
  interestLevelSchema,
  leadStatusSchema,
} from "@/lib/actions/schemas";

/* ------------------------------------------------------------------ */
/* 1 — Note → structured update                                        */
/* ------------------------------------------------------------------ */

/**
 * The highest-value feature in the brief: a caller types or dictates what
 * happened and gets back a filled-in form to confirm with one tap. It is a
 * *suggestion*, never a write — the action that applies it is separate and
 * runs through the same guards and Zod schemas as any manual edit.
 */
export const noteSuggestionSchema = z.object({
  status: leadStatusSchema.nullish(),
  interestLevel: interestLevelSchema.nullish(),
  followUpInDays: z.number().int().min(0).max(365).nullish(),
  followUpChannel: followUpChannelSchema.nullish(),
  trialIntent: z.boolean().nullish(),
  summary: z.string().min(1).max(240),
  tags: z.array(z.string().min(1).max(40)).max(5).default([]),
});

export type NoteSuggestion = z.infer<typeof noteSuggestionSchema>;

const NOTE_SYSTEM = `You read a cold-caller's rough note about a sales call and turn it into structured CRM fields.

The product being sold is an AI receptionist, on a 7-day free demo week.

Reply with JSON only, using exactly these keys:
  status            one of: new, attempted, connected, interested, demo_scheduled, trial_active, converted, lost, not_interested, wrong_number, callback_later, do_not_call. Omit if the note does not clearly say.
  interestLevel     one of: hot, warm, cold. Omit if unclear.
  followUpInDays    whole days from today until the caller should follow up. Omit if the note names no follow-up.
  followUpChannel   one of: call, whatsapp, email. Omit unless the note says which.
  trialIntent       true only if they actually agreed to start the demo week.
  summary           one tidy sentence, max 200 characters, in plain English.
  tags              up to 3 short lowercase labels for things worth filtering on later (e.g. "price-sensitive", "gatekeeper", "multi-branch"). Never a tag for the status or interest — those have their own fields.

Rules:
- Only report what the note says. Never infer enthusiasm from politeness.
- "Call me after Eid" or "next month" means estimate followUpInDays; be conservative.
- If they said no, that is not_interested — not lost.
- If the person on the phone was not the target, that is gatekeeper in tags, not wrong_number.
- Omit any key you are not confident about. A missing field is much better than a wrong one.`;

export async function suggestFromNote(
  note: string,
  context: { status: string; interestLevel: string | null; company: string | null; attempts: number },
): Promise<AiResult<NoteSuggestion>> {
  return askAI({
    system: NOTE_SYSTEM,
    user: [
      `Today is ${formatISO(new Date(), { representation: "date" })}.`,
      `The lead is currently "${context.status}"${context.interestLevel ? `, interest "${context.interestLevel}"` : ""}.`,
      context.company ? `Company: ${context.company}.` : null,
      `Attempts so far: ${context.attempts}.`,
      "",
      "The caller's note:",
      note.slice(0, 2000),
    ]
      .filter(Boolean)
      .join("\n"),
    schema: noteSuggestionSchema,
    maxTokens: 400,
  });
}

/** Turns the model's relative day count into the absolute date we store. */
export function followUpDateFrom(suggestion: NoteSuggestion, now = new Date()): Date | null {
  if (suggestion.followUpInDays === null || suggestion.followUpInDays === undefined) return null;
  return addDays(now, Math.max(suggestion.followUpInDays, 0));
}

/* ------------------------------------------------------------------ */
/* 3 — Objection coach                                                 */
/* ------------------------------------------------------------------ */

export const objectionCoachSchema = z.object({
  rebuttals: z
    .array(
      z.object({
        angle: z.string().min(1).max(60),
        say: z.string().min(1).max(400),
      }),
    )
    .min(1)
    .max(3),
  grounded: z.boolean().default(false),
});

export type ObjectionCoaching = z.infer<typeof objectionCoachSchema>;

const COACH_SYSTEM = `You coach a cold-caller selling an AI receptionist (answers the phone, books appointments, never misses a call) on a 7-day free demo week.

You are given an objection the prospect just raised, and real notes from this team's own leads who raised similar objections and later became paying clients.

Reply with JSON only:
  rebuttals   1-3 items, each { "angle": short label, "say": what to actually say out loud }
  grounded    true if you used the supplied notes, false if you fell back on general reasoning

Rules:
- Write "say" as speech, in the caller's own plain register. No corporate script language, no exclamation marks.
- Prefer angles that appear in the supplied notes — this team's own history beats generic sales advice.
- Keep each "say" under 45 words. On a live call, long is useless.
- Never invent a statistic, a price, a customer name, or a feature.
- If the notes show nothing relevant, set grounded to false and give plain honest reasoning.`;

export async function coachObjection(
  objection: string,
  wonNotes: string[],
): Promise<AiResult<ObjectionCoaching>> {
  return askAI({
    system: COACH_SYSTEM,
    user: [
      `The objection: "${objection.slice(0, 500)}"`,
      "",
      wonNotes.length > 0
        ? `Notes from leads on this team who objected similarly and later converted:\n${wonNotes
            .slice(0, 15)
            .map((n, i) => `${i + 1}. ${n.slice(0, 300)}`)
            .join("\n")}`
        : "This team has no converted leads with notes yet.",
    ].join("\n"),
    schema: objectionCoachSchema,
    maxTokens: 600,
    temperature: 0.4,
  });
}

/* ------------------------------------------------------------------ */
/* 5 — Follow-up message drafting                                      */
/* ------------------------------------------------------------------ */

export const draftSchema = z.object({
  message: z.string().min(1).max(900),
});

const DRAFT_SYSTEM = `You draft a short follow-up message from a cold-caller to a prospect, about an AI receptionist product on a 7-day free demo week.

Reply with JSON only: { "message": "..." }

Rules:
- Write as the caller, first person, plain and warm. Not marketing copy.
- WhatsApp: under 50 words, no greeting block, no signature, no emoji unless the notes suggest that register.
- Email: under 110 words, one clear ask, no subject line.
- Reference something specific and true from the notes. If the notes give you nothing specific, keep it short and general rather than inventing detail.
- Never invent a price, a discount, a statistic, or a feature.
- End with one clear, easy next step.`;

export async function draftFollowUp(input: {
  channel: "whatsapp" | "email";
  leadName: string;
  company: string | null;
  status: string;
  trialDay: number | null;
  notes: string[];
  senderName: string;
}): Promise<AiResult<{ message: string }>> {
  return askAI({
    system: DRAFT_SYSTEM,
    user: [
      `Channel: ${input.channel}`,
      `From: ${input.senderName}`,
      `To: ${input.leadName}${input.company ? ` at ${input.company}` : ""}`,
      `Pipeline status: ${input.status}`,
      input.trialDay ? `They are on day ${input.trialDay} of the 7-day demo week.` : null,
      "",
      input.notes.length > 0
        ? `Recent notes about this lead:\n${input.notes.slice(0, 6).map((n) => `- ${n.slice(0, 300)}`).join("\n")}`
        : "There are no notes on this lead yet.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: draftSchema,
    maxTokens: 400,
    temperature: 0.5,
  });
}

/* ------------------------------------------------------------------ */
/* 4 — Nightly manager brief                                           */
/* ------------------------------------------------------------------ */

export const briefSchema = z.object({
  headline: z.string().min(1).max(120),
  body: z.string().min(1).max(600),
});

const BRIEF_SYSTEM = `You write a short nightly brief for the manager of a small outbound calling team selling an AI receptionist.

Reply with JSON only: { "headline": "...", "body": "..." }

Rules:
- headline: under 90 characters, the single most important thing about today.
- body: 2-3 sentences. What moved, the likeliest reason given the numbers, and the one thing to do tomorrow.
- Use ONLY the numbers supplied. Never invent a figure, a name, or a trend you were not given.
- If a number is flat or absent, say so plainly rather than dressing it up.
- No greetings, no sign-off, no bullet points.`;

export async function writeBrief(facts: Record<string, unknown>): Promise<AiResult<z.infer<typeof briefSchema>>> {
  return askAI({
    system: BRIEF_SYSTEM,
    user: `Today's numbers for this team:\n${JSON.stringify(facts, null, 2)}`,
    schema: briefSchema,
    maxTokens: 400,
    temperature: 0.3,
  });
}
