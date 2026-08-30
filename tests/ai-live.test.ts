import { describe, expect, it } from "vitest";

/**
 * Live smoke test against the real OpenRouter API. Opt-in, because it costs
 * rate-limit budget and depends on a third party being up:
 *
 *   AI_LIVE=1 pnpm test
 *
 * It is deliberately lenient about *content* — a free model's prose is not
 * something to assert on — and strict about the contract: the call succeeds,
 * and what comes back satisfies the Zod schema the app will act on. That is
 * the thing worth knowing before shipping a model change.
 */

const live = process.env.AI_LIVE === "1" && Boolean(process.env.OPENROUTER_API_KEY);

describe.skipIf(!live)("OpenRouter, live", () => {
  const NOTE =
    "Spoke to the owner. Reception misses calls after 6pm and they lose bookings. " +
    "Budget is tight but he wants to try the demo week. Call back after Eid, about 10 days.";

  it("turns a caller's note into fields the app can act on", async () => {
    const { suggestFromNote } = await import("@/lib/ai/features");

    const result = await suggestFromNote(NOTE, {
      status: "attempted",
      interestLevel: null,
      company: "Crescent Dental",
      attempts: 2,
    });

    expect(result.ok, `AI call failed: ${result.ok ? "" : result.reason}`).toBe(true);
    if (!result.ok) return;

    console.log("note→fields:", JSON.stringify(result.data));
    expect(result.data.summary.length).toBeGreaterThan(10);
    // The note says "call back after Eid, about 10 days" — a model that reads
    // it at all should land somewhere sane, not next year.
    if (result.data.followUpInDays != null) {
      expect(result.data.followUpInDays).toBeGreaterThan(0);
      expect(result.data.followUpInDays).toBeLessThan(60);
    }
  }, 60_000);

  it("coaches an objection from the team's own history", async () => {
    const { coachObjection } = await import("@/lib/ai/features");

    const result = await coachObjection("We already have a receptionist", [
      "Owner said the same, then realised the receptionist goes home at 6 and that is when most bookings come in.",
      "They kept their receptionist and used us for after-hours only. Converted on day 6.",
    ]);

    expect(result.ok, `AI call failed: ${result.ok ? "" : result.reason}`).toBe(true);
    if (!result.ok) return;

    console.log("coach:", JSON.stringify(result.data));
    expect(result.data.rebuttals.length).toBeGreaterThan(0);
    expect(result.data.rebuttals[0]!.say.length).toBeGreaterThan(10);
  }, 60_000);

  it("drafts a follow-up message", async () => {
    const { draftFollowUp } = await import("@/lib/ai/features");

    const result = await draftFollowUp({
      channel: "whatsapp",
      leadName: "Ahmed Khan",
      company: "Crescent Dental",
      status: "trial_active",
      trialDay: 4,
      notes: [NOTE],
      senderName: "Zainab",
    });

    expect(result.ok, `AI call failed: ${result.ok ? "" : result.reason}`).toBe(true);
    if (!result.ok) return;

    console.log("draft:", JSON.stringify(result.data.message));
    expect(result.data.message.length).toBeGreaterThan(20);
  }, 60_000);

  it("writes the nightly manager brief", async () => {
    const { writeBrief } = await import("@/lib/ai/features");

    const result = await writeBrief({
      team: "Outbound",
      dials: 83,
      answered: 23,
      connectRatePercent: 28,
      markedInterested: 4,
      converted: 0,
      trialsEndingWithin48h: 1,
      trialsAwaitingDecision: 0,
      overdueFollowUps: 32,
    });

    expect(result.ok, `AI call failed: ${result.ok ? "" : result.reason}`).toBe(true);
    if (!result.ok) return;

    console.log("brief:", JSON.stringify(result.data));
    expect(result.data.headline.length).toBeGreaterThan(5);
    expect(result.data.body.length).toBeGreaterThan(20);
  }, 60_000);
});
