/**
 * Seeds a realistic Raynaters Call Desk workspace: one org, one team, six people
 * (owner + team lead + four agents), three import batches and ~240 leads
 * spread across the whole funnel, with call history, trials in flight and
 * 45 days of aggregated stats so every chart has something to draw.
 *
 *   pnpm db:seed              # wipes app data, reseeds
 *   pnpm db:seed -- --keep    # adds leads without wiping
 */
import "dotenv/config";
import { Pool } from "pg";
import { poolConfig } from "../src/lib/db/ssl";
import { can, hasDailyTargets } from "../src/lib/domain/roles";
import { drizzle } from "drizzle-orm/node-postgres";
import bcrypt from "bcryptjs";
import { addDays, subDays, subHours, subMinutes, startOfDay } from "date-fns";
import * as schema from "../src/lib/db/schema";

const {
  organizations,
  teams,
  users,
  memberships,
  leadVisibilityLinks,
  importBatches,
  leads,
  activities,
  dailyStats,
  notifications,
  customFieldDefs,
  doNotCall,
} = schema;

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");

const pool = new Pool(poolConfig(url));
const db = drizzle(pool, { schema });

const KEEP = process.argv.includes("--keep");
const PASSWORD = "raynaters123";

/* ------------------------------ Fixtures ----------------------------- */

/* One of each role, so every permission path has a real account to sign in as
   and check. The three non-calling roles carry a zero dial target — a target
   for someone who never calls would show as a permanent 0% ring. */
const PEOPLE = [
  { name: "Zainab Haider", email: "zainab@raynaters.test", role: "owner" as const, dial: 40, connect: 10 },
  { name: "Imran Qadir", email: "imran@raynaters.test", role: "manager" as const, dial: 20, connect: 5 },
  { name: "Bilal Ahmed", email: "bilal@raynaters.test", role: "team_lead" as const, dial: 60, connect: 14 },
  { name: "Sara Iqbal", email: "sara@raynaters.test", role: "agent" as const, dial: 70, connect: 16 },
  { name: "Usman Tariq", email: "usman@raynaters.test", role: "agent" as const, dial: 65, connect: 14 },
  { name: "Ayesha Noor", email: "ayesha@raynaters.test", role: "agent" as const, dial: 60, connect: 12 },
  { name: "Hamza Sheikh", email: "hamza@raynaters.test", role: "agent" as const, dial: 55, connect: 11 },
  { name: "Mehak Raza", email: "mehak@raynaters.test", role: "researcher" as const, dial: 0, connect: 0 },
  { name: "Adnan Yousuf", email: "adnan@raynaters.test", role: "viewer" as const, dial: 0, connect: 0 },
];

const FIRST = ["Ahmed","Fatima","Omar","Hina","Kashif","Nida","Rizwan","Sana","Tariq","Amna","Junaid","Maryam","Salman","Zara","Faisal","Kiran","Adeel","Sadia","Waqas","Noor","Imran","Rabia","Shahid","Areeba","Danish","Mehwish","Asad","Iqra","Bilal","Sidra","Owais","Laiba","Hassan","Anum","Kamran","Sobia","Nadeem","Hira","Yasir","Mahnoor"];
const LAST = ["Khan","Malik","Butt","Chaudhry","Qureshi","Siddiqui","Hussain","Raza","Javed","Aslam","Farooq","Mirza","Baig","Shah","Awan","Ansari","Rehman","Zaidi","Abbasi","Durrani"];

const COMPANY_PREFIX = ["Crescent","Meridian","Silk Route","Indus","Karakoram","Falcon","Nova","Vertex","Cobalt","Sapphire","Orchard","Ravi","Zenith","Pioneer","Harbour","Summit","Aster","Beacon","Cedar","Delta"];
const COMPANY_KIND = ["Dental","Clinic","Realty","Motors","Salon","Legal","Logistics","Interiors","Fitness","Diagnostics","Travel","Academy","Pharmacy","Auto Care","Property","Consulting","Catering","Optics","Vet Care","Studios"];

const TITLES = ["Owner","Managing Director","Practice Manager","Operations Head","Founder","Clinic Director","Branch Manager","General Manager","Reception Lead","Partner"];

const CITIES: Array<[string, string, string]> = [
  ["Karachi", "PK", "Asia/Karachi"],
  ["Lahore", "PK", "Asia/Karachi"],
  ["Islamabad", "PK", "Asia/Karachi"],
  ["Rawalpindi", "PK", "Asia/Karachi"],
  ["Faisalabad", "PK", "Asia/Karachi"],
  ["Dubai", "AE", "Asia/Dubai"],
  ["Sharjah", "AE", "Asia/Dubai"],
  ["Riyadh", "SA", "Asia/Riyadh"],
  ["London", "GB", "Europe/London"],
  ["Manchester", "GB", "Europe/London"],
];

const TAGS = ["clinic","hi-volume","multi-branch","referral","reception-pain","after-hours","missed-calls","gatekeeper","budget","decision-maker"];

const BATCHES = [
  { filename: "karachi-clinics-may.csv", tag: "clinic", quality: 0.9 },
  { filename: "lahore-realty-scrape.xlsx", tag: "realty", quality: 0.55 },
  { filename: "gulf-salons-batch3.csv", tag: "salon", quality: 0.3 },
];

const NOTE_LINES = [
  "Reception misses 20-30 calls a day, mostly after 6pm. Interested in a demo.",
  "Wants to see it working before committing. Asked to call back next week.",
  "Gatekeeper wouldn't put me through. Try the mobile number after 5pm.",
  "Already using an answering service, unhappy with the cost.",
  "Budget is tight this quarter but wants the trial anyway.",
  "Owner travels a lot — WhatsApp is the better channel.",
  "Three branches, wants one number routed to all of them.",
  "Asked for pricing in writing before the demo.",
  "Said call after Eid. Noted for follow-up.",
  "Very warm — booked the demo on the spot.",
  "Number rings out every time. Two attempts so far.",
  "Wrong number, this is a residence.",
];

const OUTCOMES = ["answered","no_answer","busy","voicemail","gatekeeper","no_answer","answered","no_answer"] as const;

/* ------------------------------- Helpers ----------------------------- */

let seed = 20260829;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}
function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]!);
  return out;
}
function chance(p: number) {
  return rnd() < p;
}
function intBetween(min: number, max: number) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
function phoneFor(country: string, i: number): string {
  const n = String(30_000_000 + i * 7919 + intBetween(0, 999)).slice(0, 9);
  if (country === "AE") return `+9715${n.slice(0, 8)}`;
  if (country === "SA") return `+9665${n.slice(0, 8)}`;
  if (country === "GB") return `+447${n.slice(0, 9)}`;
  return `+923${n.slice(0, 9)}`;
}

/* -------------------------------- Seed ------------------------------- */

async function main() {
  console.log("→ seeding Raynaters Call Desk…");

  if (!KEEP) {
    await db.execute(
      `truncate table activities, daily_stats, notifications, lead_visibility_links, leads,
       import_batches, do_not_call, custom_field_defs, saved_views, invites, memberships,
       teams, organizations, sessions, accounts, users restart identity cascade`,
    );
  }

  const [org] = await db
    .insert(organizations)
    .values({ name: "Nexa AI Receptionist", timezone: "Asia/Karachi" })
    .returning();
  const [team] = await db.insert(teams).values({ orgId: org!.id, name: "Outbound" }).returning();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const people = await db
    .insert(users)
    .values(
      PEOPLE.map((p) => ({
        name: p.name,
        email: p.email,
        passwordHash,
        timezone: "Asia/Karachi",
        lastSeenAt: subHours(new Date(), intBetween(0, 30)),
      })),
    )
    .returning();

  await db.insert(memberships).values(
    people.map((u, i) => ({
      teamId: team!.id,
      userId: u.id,
      role: PEOPLE[i]!.role,
      /* Roles that do not work to a quota store zero, so nothing downstream
         has to special-case a target that was never meant to apply. */
      dailyDialTarget: hasDailyTargets(PEOPLE[i]!.role) ? PEOPLE[i]!.dial : 0,
      dailyConnectTarget: hasDailyTargets(PEOPLE[i]!.role) ? PEOPLE[i]!.connect : 0,
    })),
  );

  /* Look people up by email rather than by position. The list above has grown
     twice now, and positional destructuring silently reassigned who was who
     both times. */
  const at = (email: string) => people[PEOPLE.findIndex((p) => p.email === email)]!;
  const researcher = at("mehak@raynaters.test");
  const teamLead = at("bilal@raynaters.test");

  // Sara can see Usman's leads; Usman cannot see Sara's. Directional on purpose —
  // this is the case the permission tests pin down.
  const sara = at("sara@raynaters.test");
  const usman = at("usman@raynaters.test");
  await db.insert(leadVisibilityLinks).values({
    teamId: team!.id,
    viewerUserId: sara!.id,
    targetUserId: usman!.id,
    createdBy: people[0]!.id,
  });

  const batches = await db
    .insert(importBatches)
    .values(
      BATCHES.map((b, i) => ({
        teamId: team!.id,
        uploadedBy: researcher.id,
        filename: b.filename,
        rowCount: 90 - i * 10,
        importedCount: 84 - i * 10,
        duplicateCount: 4,
        errorCount: 2,
        columnMapping: { "Full Name": "fullName", Company: "company", Phone: "phonePrimary", City: "city" },
        assignmentStrategy: "round_robin" as const,
        status: "done" as const,
        createdAt: subDays(new Date(), 40 - i * 12),
      })),
    )
    .returning();

  await db.insert(customFieldDefs).values([
    { orgId: org!.id, key: "branches", label: "Branches", fieldType: "number", sortOrder: 0 },
    {
      orgId: org!.id,
      key: "current_solution",
      label: "Current solution",
      fieldType: "select",
      options: ["None", "Receptionist", "Answering service", "Voicemail", "Other"],
      sortOrder: 1,
    },
    { orgId: org!.id, key: "facebook", label: "Facebook", fieldType: "text", sortOrder: 2 },
    { orgId: org!.id, key: "instagram", label: "Instagram", fieldType: "text", sortOrder: 3 },
    { orgId: org!.id, key: "linkedin", label: "LinkedIn", fieldType: "text", sortOrder: 4 },
    { orgId: org!.id, key: "decision_maker", label: "Spoke to decision maker", fieldType: "boolean", sortOrder: 2 },
  ]);

  await db.insert(doNotCall).values([
    { orgId: org!.id, phone: "+923001112233", reason: "Asked to be removed", addedBy: people[0]!.id },
    { orgId: org!.id, phone: "+923214445566", reason: "Complained about repeat calls", addedBy: researcher.id },
  ]);

  /* ------------------------------ Leads ----------------------------- */

  /* Only roles that actually call carry a book of leads — a researcher or a
     viewer holding leads would be a contradiction the UI has no way to show.
     The owner keeps a light book, so they are excluded too. */
  const agents = people.filter(
    (_, i) => can(PEOPLE[i]!.role, "calls.log") && PEOPLE[i]!.role !== "owner",
  );
  const now = new Date();
  const leadRows: (typeof leads.$inferInsert)[] = [];
  const TOTAL = 240;

  for (let i = 0; i < TOTAL; i++) {
    const batch = batches[i % batches.length]!;
    const quality = BATCHES[i % BATCHES.length]!.quality;
    const [city, country, tz] = pick(CITIES);
    const owner = pick(agents);
    const createdAt = subDays(now, intBetween(1, 55));

    // Funnel shape driven by batch quality, so /analytics shows a real story.
    const roll = rnd() * quality * 1.35;
    let status: schema.LeadStatus = "new";
    let trialStatus: schema.TrialStatus = "none";
    let interest: schema.InterestLevel | null = null;
    let attempts = 0;
    let connects = 0;
    let convertedAt: Date | null = null;
    let trialStartedAt: Date | null = null;
    let trialEndsAt: Date | null = null;
    let demoScheduledAt: Date | null = null;
    let lostReason: schema.Lead["lostReason"] = null;

    if (roll > 0.95) {
      status = "converted";
      trialStatus = "converted";
      interest = "hot";
      attempts = intBetween(4, 9);
      connects = intBetween(3, 5);
      trialStartedAt = subDays(now, intBetween(10, 30));
      trialEndsAt = addDays(trialStartedAt, 7);
      convertedAt = addDays(trialStartedAt, 7);
      demoScheduledAt = subDays(trialStartedAt, 2);
    } else if (roll > 0.86) {
      trialStartedAt = subDays(now, intBetween(0, 8));
      trialEndsAt = addDays(trialStartedAt, 7);
      demoScheduledAt = subDays(trialStartedAt, 1);
      const ended = trialEndsAt < now;
      status = ended ? "trial_active" : "trial_active";
      trialStatus = ended ? "ended_pending" : "active";
      interest = "hot";
      attempts = intBetween(3, 7);
      connects = intBetween(2, 4);
    } else if (roll > 0.78) {
      status = "demo_scheduled";
      trialStatus = "scheduled";
      demoScheduledAt = addDays(now, intBetween(0, 4));
      interest = "hot";
      attempts = intBetween(2, 5);
      connects = intBetween(1, 3);
    } else if (roll > 0.62) {
      status = "interested";
      interest = chance(0.55) ? "hot" : "warm";
      attempts = intBetween(2, 5);
      connects = intBetween(1, 3);
    } else if (roll > 0.46) {
      status = "connected";
      interest = chance(0.4) ? "warm" : "cold";
      attempts = intBetween(1, 4);
      connects = 1;
    } else if (roll > 0.36) {
      status = "callback_later";
      interest = "warm";
      attempts = intBetween(1, 3);
      connects = 1;
    } else if (roll > 0.28) {
      status = chance(0.5) ? "not_interested" : "lost";
      lostReason = pick(["price", "no_need", "competitor", "bad_timing", "other"] as const);
      interest = "cold";
      attempts = intBetween(1, 4);
      connects = 1;
    } else if (roll > 0.22) {
      status = "wrong_number";
      attempts = 1;
    } else if (roll > 0.1) {
      status = "attempted";
      attempts = intBetween(1, 5);
    }

    const lastAttemptedAt = attempts > 0 ? subDays(now, intBetween(0, 20)) : null;
    const openStatus = !["converted", "lost", "not_interested", "wrong_number", "do_not_call"].includes(status);

    let nextFollowUpAt: Date | null = null;
    let followUpNote: string | null = null;
    if (trialStatus === "active" && trialStartedAt) {
      const day = [1, 4, 6, 7].find((d) => addDays(trialStartedAt!, d) > now) ?? 7;
      nextFollowUpAt = addDays(trialStartedAt, day);
      followUpNote = `Day ${day} — ${day === 1 ? "setup check" : day === 4 ? "mid-week value check" : day === 6 ? "pre-close" : "conversion call"}`;
    } else if (trialStatus === "ended_pending") {
      nextFollowUpAt = subDays(now, intBetween(1, 3));
      followUpNote = "Trial ended — conversion call";
    } else if (openStatus && chance(0.55)) {
      nextFollowUpAt = chance(0.35) ? subDays(now, intBetween(1, 6)) : addDays(now, intBetween(0, 9));
      followUpNote = chance(0.5) ? "Call back" : null;
    }

    const first = pick(FIRST);
    const last = pick(LAST);
    const company = `${pick(COMPANY_PREFIX)} ${pick(COMPANY_KIND)}`;
    const handle = company.toLowerCase().replace(/[^a-z0-9]+/g, "");

    leadRows.push({
      orgId: org!.id,
      teamId: team!.id,
      fullName: `${first} ${last}`,
      company,
      jobTitle: pick(TITLES),
      phonePrimary: phoneFor(country, i),
      email: chance(0.55) ? `${first.toLowerCase()}@${pick(COMPANY_PREFIX).toLowerCase().replace(/\s/g, "")}.com` : null,
      website: chance(0.3) ? `https://${pick(COMPANY_PREFIX).toLowerCase().replace(/\s/g, "")}.pk` : null,
      city,
      country,
      timezone: tz,
      source: chance(0.9) ? "scraped" : pick(["referral", "inbound", "ad"] as const),
      sourceBatchId: batch.id,
      sourceNote: BATCHES[i % BATCHES.length]!.filename,
      status,
      interestLevel: interest,
      lostReason,
      demoScheduledAt,
      trialStartedAt,
      trialEndsAt,
      trialStatus,
      convertedAt,
      nextFollowUpAt,
      followUpChannel: nextFollowUpAt ? pick(["call", "call", "whatsapp"] as const) : null,
      followUpNote,
      followUpCount: nextFollowUpAt ? intBetween(0, 3) : 0,
      assignedTo: chance(0.94) ? owner.id : null,
      createdBy: researcher.id,
      attemptsCount: attempts,
      connectsCount: connects,
      lastAttemptedAt,
      lastConnectedAt: connects > 0 ? lastAttemptedAt : null,
      score: Math.round(Math.min(98, Math.max(6, quality * 60 + (interest === "hot" ? 30 : interest === "warm" ? 15 : 0) + intBetween(-8, 8)))),
      tags: pickN(TAGS, intBetween(0, 3)),
      customFields: {
        branches: intBetween(1, 5),
        decision_maker: chance(0.5),
        /* The socials a scraped sheet usually carries — these exist so the
           lead drawer's custom-field section has something to show. */
        ...(chance(0.6) ? { facebook: `facebook.com/${handle}` } : {}),
        ...(chance(0.4) ? { instagram: `instagram.com/${handle}` } : {}),
        ...(chance(0.3) ? { linkedin: `linkedin.com/company/${handle}` } : {}),
      },
      createdAt,
      updatedAt: lastAttemptedAt ?? createdAt,
    });
  }

  const inserted = await db.insert(leads).values(leadRows).returning({
    id: leads.id,
    assignedTo: leads.assignedTo,
    attempts: leads.attemptsCount,
    connects: leads.connectsCount,
    status: leads.status,
    trialStatus: leads.trialStatus,
    trialStartedAt: leads.trialStartedAt,
  });
  console.log(`  ${inserted.length} leads`);

  /* ---------------------------- Activities -------------------------- */

  const activityRows: (typeof activities.$inferInsert)[] = [];
  for (const lead of inserted) {
    activityRows.push({
      leadId: lead.id,
      userId: teamLead.id,
      type: "import",
      body: "Imported from a scraped sheet",
      createdAt: subDays(now, intBetween(20, 55)),
    });

    let connectsLeft = lead.connects;
    for (let a = 0; a < lead.attempts; a++) {
      const at = subDays(now, intBetween(0, 25));
      const answered = connectsLeft > 0 && chance(0.6);
      if (answered) connectsLeft--;
      activityRows.push({
        leadId: lead.id,
        userId: lead.assignedTo ?? sara.id,
        type: "call",
        callOutcome: answered ? "answered" : pick(OUTCOMES.filter((o) => o !== "answered")),
        durationSeconds: answered ? intBetween(45, 480) : intBetween(4, 25),
        body: answered && chance(0.6) ? pick(NOTE_LINES) : null,
        createdAt: subMinutes(at, intBetween(0, 600)),
      });
    }

    if (chance(0.35)) {
      activityRows.push({
        leadId: lead.id,
        userId: lead.assignedTo ?? sara.id,
        type: "note",
        body: pick(NOTE_LINES),
        createdAt: subDays(now, intBetween(0, 18)),
      });
    }

    if (lead.trialStartedAt) {
      activityRows.push({
        leadId: lead.id,
        userId: lead.assignedTo ?? sara.id,
        type: "trial_event",
        body: "7-day demo week started",
        toValue: { trialStatus: "active" },
        createdAt: lead.trialStartedAt,
      });
    }
    if (lead.status === "converted") {
      activityRows.push({
        leadId: lead.id,
        userId: lead.assignedTo ?? sara.id,
        type: "trial_event",
        body: "Converted to paying client",
        toValue: { trialStatus: "converted" },
        createdAt: subDays(now, intBetween(0, 12)),
      });
    }
  }
  for (let i = 0; i < activityRows.length; i += 500) {
    await db.insert(activities).values(activityRows.slice(i, i + 500));
  }
  console.log(`  ${activityRows.length} activities`);

  /* ---------------------------- Daily stats ------------------------- */

  const statRows: (typeof dailyStats.$inferInsert)[] = [];
  for (let d = 44; d >= 0; d--) {
    const day = startOfDay(subDays(now, d));
    const weekday = day.getDay();
    if (weekday === 0) continue; // Sunday off
    for (const person of people) {
      const idx = people.indexOf(person);
      /* Non-calling roles get no rows at all. A researcher sitting at the
         bottom of the leaderboard on 0 dials reads as underperformance
         rather than as "this job is not calling". */
      if (!can(PEOPLE[idx]!.role, "calls.log")) continue;
      const base = PEOPLE[idx]!.dial;
      const dials = Math.max(0, Math.round(base * (0.55 + rnd() * 0.75)));
      const answered = Math.round(dials * (0.16 + rnd() * 0.16));
      const interested = Math.round(answered * (0.2 + rnd() * 0.25));
      const demos = Math.round(interested * (0.35 + rnd() * 0.3));
      const trialsStarted = Math.round(demos * (0.55 + rnd() * 0.3));
      const converted = chance(0.35) ? Math.round(trialsStarted * (0.3 + rnd() * 0.3)) : 0;
      statRows.push({
        orgId: org!.id,
        teamId: team!.id,
        userId: person.id,
        date: day.toISOString().slice(0, 10),
        dials,
        answered,
        interested,
        demosScheduled: demos,
        trialsStarted,
        converted,
        lost: Math.round(answered * rnd() * 0.2),
        notesAdded: Math.round(answered * 0.7),
        followUpsCompleted: Math.round(dials * 0.2),
      });
    }
  }
  await db.insert(dailyStats).values(statRows).onConflictDoNothing();
  console.log(`  ${statRows.length} daily stat rows`);

  /* --------------------------- Notifications ------------------------ */

  await db.insert(notifications).values([
    {
      userId: sara!.id,
      type: "trial_ending",
      title: "2 demo weeks end in the next 48 hours",
      body: "Line up the conversion calls before they lapse.",
      link: "/trials",
      createdAt: subHours(now, 3),
    },
    {
      userId: sara!.id,
      type: "overdue",
      title: "You have overdue follow-ups",
      body: "Some follow-up dates have already passed.",
      link: "/today",
      createdAt: subHours(now, 20),
    },
    {
      userId: people[0]!.id,
      type: "brief",
      title: "Nightly brief is ready",
      body: "Connect rate is up on the Karachi clinics batch.",
      link: "/analytics",
      isRead: true,
      createdAt: subHours(now, 30),
    },
  ]);

  console.log("\n✔ seed complete\n");
  console.log("  Sign in with any of these — password: " + PASSWORD);
  for (const p of PEOPLE) console.log(`    ${p.role.padEnd(10)} ${p.email}`);
  console.log("");
}

main()
  .catch((error) => {
    console.error("✘ seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
