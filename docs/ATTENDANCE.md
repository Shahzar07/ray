# Attendance & analytics permissions — design spec

Adds shift tracking (check-in / check-out) to CallDesk and changes who can see what.
Written to be implemented directly: schema, permissions, screens, edge cases, order of
work. Nothing here is built yet.

---

## The problem being solved

Two things, and they're connected:

1. **Agents need to clock their time.** Check in when they start, check out when they
   stop, several times a day. Each agent keeps a plain record of their own days.
2. **Managers need to see the team working.** Who's on right now, when they checked in,
   when they left, how many hours — *joined to what they produced in those hours.* That
   join is the whole point: "48 dials" means nothing until you know it took 4 hours or 9.

And a permission change that came with it: **team analytics becomes owner + manager
only.** Agents keep the leaderboard and their own daily record, nothing else.

---

## Decisions taken (confirmed with the user)

| Question | Decision |
| --- | --- |
| Shift shape | **Multiple sessions per day.** Check in and out as often as you like. Lunch, prayer, an errand — each gap ends a session and the next check-in starts a new one. Day total = sum of that day's sessions. |
| Does check-in gate work? | **No — advisory only.** Everything in the app works whether you're checked in or not. A quiet banner offers a one-tap check-in. An attendance bug must never stop the team selling. |
| Forgotten check-out | **Auto-close, then flag.** A cron closes stale sessions at the agent's last real activity, marks them `auto_closed`, and surfaces them to the manager to confirm or correct. The agent sees the flag on their own record too. |
| Leaderboard | **Stays visible to everyone.** Agents see the ranked leaderboard and their own numbers. Everything else team-wide — funnels, per-member breakdowns, attendance, hours — is owner + manager only. |

### A deliberate reading worth flagging

The user said agents *"will not see the whole analytic of their month — they will just
have a track record of every day."*

So the agent's timesheet shows **a per-day list with each day's total, and nothing
above that**. No month total, no weekly average, no chart, no trend line, no comparison
to anyone. Browsing back through previous months is fine — that's still "a track record
of every day" — but the page never aggregates across days.

This is the strict reading. If the user later wants "hours this month" on their own
timesheet, it's one query and one tile; the spec is built so that's an additive change,
not a rework.

---

## Permission model

The new rule, stated once: **attendance is self-service to read, manager-only to
correct; team analytics is manager-only entirely, except the leaderboard.**

| Surface | agent | team_lead | owner |
| --- | :---: | :---: | :---: |
| Check in / out (self) | ✅ | ✅ | ✅ |
| Own daily timesheet | ✅ | ✅ | ✅ |
| Another person's timesheet | ❌ | ✅ own team | ✅ all teams |
| Live "who's on now" | ❌ | ✅ own team | ✅ all teams |
| Correct / add a session | ❌ | ✅ own team | ✅ all teams |
| Request a correction on own session | ✅ | ✅ | — |
| Leaderboard | ✅ | ✅ | ✅ |
| Team analytics (funnel, per-member, hours vs output) | ❌ | ✅ own team | ✅ all teams |
| Own aggregate analytics | ❌ | ✅ | ✅ |

### Route changes

| Route | Before | After |
| --- | --- | --- |
| `/analytics` | everyone | **owner + team_lead only** |
| `/leaderboard` | — | **new**, everyone |
| `/timesheet` | — | **new**, everyone (own record) |
| `/team` | owner + team_lead | unchanged, gains attendance tabs |

Splitting the leaderboard onto its own route keeps the rule "one route, one permission",
which is much easier to get right than "this page but only these three cards". `/analytics`
still renders the leaderboard as a card so managers don't need two pages.

### Guards to add — `src/lib/auth/visibility.ts`

Same shape as the existing guards: throw `PermissionError`, never return a boolean.

```ts
/** Own attendance always; a manager's for anyone in their scope. */
assertCanViewAttendance(userId, targetUserId, teamId): Promise<void>

/** Managers only — corrections are never self-service. */
assertCanEditSession(userId, sessionId): Promise<void>

/** owner | team_lead. Gates /analytics and /team. */
assertCanViewTeamAnalytics(userId, teamId): Promise<Role>
```

Reuse `visibleUserIds()` for scoping a manager's team view — attendance visibility
follows the same lead-visibility scope, so an owner sees the org and a team lead sees
their team. **Do not invent a second scoping mechanism.**

### Tests to add to `tests/visibility.test.ts`

The existing 22 tests are the template. Add:

- an agent cannot read a peer's attendance, *even a peer they hold a lead-visibility
  link for* — lead visibility is not attendance visibility, and this is the trap
- an agent cannot edit their own session
- a team lead can read and edit any session in their team
- a team lead cannot read a session in another team
- an owner can read and edit across teams
- `assertCanViewTeamAnalytics` rejects an agent, accepts lead and owner

---

## Data model

### New table — `work_sessions`

One row per check-in → check-out. This is the source of truth.

```ts
export const sessionSourceEnum = pgEnum("session_source", [
  "manual",       // agent tapped check out
  "auto_closed",  // cron closed a forgotten session
  "adjusted",     // a manager edited the times
  "added",        // a manager created it retroactively
]);

export const workSessions = pgTable("work_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),          // null = still checked in

  /**
   * The AGENT's local calendar date at check-in. This is what groups sessions
   * into "days" — never UTC, never the org's zone. A session that crosses
   * midnight belongs to the date it started.
   */
  localDate: date("local_date").notNull(),

  /** Denormalised on close so day totals never recompute from timestamps. */
  durationSeconds: integer("duration_seconds"),

  source: sessionSourceEnum("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("work_sessions_user_date_idx").on(t.userId, t.localDate),
  index("work_sessions_team_date_idx").on(t.teamId, t.localDate),
]);
```

Plus one thing Drizzle can't express, added by hand in the migration — **the constraint
that makes double check-in impossible at the database level**:

```sql
create unique index work_sessions_one_open_per_user
  on work_sessions (user_id)
  where ended_at is null;
```

### New table — `work_session_adjustments`

Every manager correction is recorded. Agents can see that their own row was edited and
by whom; without that the feature is not trustworthy.

```ts
export const workSessionAdjustments = pgTable("work_session_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => workSessions.id, { onDelete: "cascade" }),
  editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
  fromValue: jsonb("from_value"),   // { startedAt, endedAt }
  toValue: jsonb("to_value"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("wsa_session_idx").on(t.sessionId, t.createdAt)]);
```

### Columns added to `daily_stats`

Attendance folds into the existing pre-aggregate so manager analytics can join hours to
output in one query. This is why the productivity metrics are cheap.

```ts
workedSeconds: integer("worked_seconds").notNull().default(0),
sessionCount: integer("session_count").notNull().default(0),
firstCheckInAt: timestamp("first_check_in_at", { withTimezone: true }),
lastCheckOutAt: timestamp("last_check_out_at", { withTimezone: true }),
```

**Read path split, and it matters:**
- The agent's own timesheet and the live "who's on" strip read `work_sessions` directly
  — they need live, unaggregated truth, and the table is tiny.
- Manager analytics read `daily_stats` — consistent with the existing rule *"do not
  compute analytics by scanning at request time."*

### Columns added for policy

```ts
// organizations
autoCloseAfterHours: integer("auto_close_after_hours").notNull().default(12),

// memberships — sits beside dailyDialTarget / dailyConnectTarget
dailyMinutesTarget: integer("daily_minutes_target").notNull().default(480),
```

### Sizing

5–10 people × ~250 working days × ~3 sessions = **under 10,000 rows a year.** Attendance
is a rounding error against the 0.5 GB free tier. Do not pre-aggregate beyond the
`daily_stats` fold, and do not build archival for it.

---

## Screens

### 1. The check-in control — global, one tap, always visible

This is the highest-traffic control in the whole feature, so it lives in the chrome
rather than on a page.

**Desktop** — sidebar footer, directly above the user menu:

```
┌────────────────────────────────┐
│  ● 4h 12m          Check out   │   checked in: green pulse + live timer
├────────────────────────────────┤
│  ○ Checked out      Check in   │   checked out: muted
└────────────────────────────────┘
```

**Mobile** — a compact pill in the top bar; the same control expanded on `/today`.

**Call Mode** — the timer joins the existing session counters in the top bar. Callers
live in this screen; they should never have to leave it to clock out.

Behaviour:
- One tap. No confirm dialog either way.
- Optimistic: the timer starts ticking immediately, the action confirms behind it.
- Toast with **Undo**, matching every other mutation in the app.
  - Undo on check-in deletes the session — allowed only while it is open and under two
    minutes old.
  - Undo on check-out reopens the session.
- The live timer ticks client-side from the server-provided `startedAt`. No polling.

### 2. `/timesheet` — the agent's own record

Everyone gets this, including managers (it's their own record). A plain reverse-
chronological list. Deliberately not a dashboard.

```
My timesheet                                    ‹  August 2026  ›

┌──────────────────────────────────────────────────────────────┐
│ ● Today · Sun 30 Aug                                 6h 12m  │
│     09:04  →  12:31                                  3h 27m  │
│     13:15  →  running                                2h 45m  │
├──────────────────────────────────────────────────────────────┤
│   Sat 29 Aug                                         7h 48m  │
│     09:12  →  13:02                                  3h 50m  │
│     13:44  →  17:42                                  3h 58m  │
├──────────────────────────────────────────────────────────────┤
│   Fri 28 Aug                              ⚠ auto-closed      │
│     09:30  →  14:32                                  5h 02m  │
│     This was closed automatically. Ask a manager to correct → │
├──────────────────────────────────────────────────────────────┤
│   Thu 27 Aug                                     No sessions │
└──────────────────────────────────────────────────────────────┘
```

- Days with nothing are shown as an explicit empty row. Gaps must be visible, not hidden.
- `auto_closed` days carry a warning chip and a "request a correction" action that
  notifies the manager with a short note.
- Edited sessions show an "edited by Bilal · 2 Sep" marker with the reason on hover.
- **No total row. No average. No chart.** Per the decision above.

### 3. `/team` — the manager's view

Restricted to owner + team_lead. Three tabs on the existing page.

**Tab: Live** — the thing a manager opens twenty times a day.

```
On now · 3 of 6                                        Sun 30 Aug

┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ ● Sara      │ │ ● Usman     │ │ ● Ayesha    │ │ ○ Hamza     │
│   4h 12m    │ │   2h 48m    │ │   6h 01m    │ │   out 2h ago│
│   48 dials  │ │   31 dials  │ │   52 dials  │ │   7h 12m    │
│   11.6 /hr  │ │   11.1 /hr  │ │    8.7 /hr  │ │   39 dials  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
                                                ┌─────────────┐
                                                │ ○ Bilal     │
                                                │ Not in today│
                                                └─────────────┘
```

Three states, visually distinct: **on now** (green pulse + running timer), **checked out
today** (muted, shows the day's total), **not in today**.

**Tab: Timesheets** — the grid, with a date-range picker.

```
Member         Mon    Tue    Wed    Thu    Fri    Sat     Total    Dials/hr
Sara Iqbal    7:48   8:02   7:31   6:59   8:11   4:02    42h33m       9.4
Usman Tariq   8:01   7:44   —      8:12   7:58   —       31h55m       7.1
Ayesha Noor   6:30⚠  8:15   8:02   7:49   8:04   3:30    42h10m       8.8
```

- A cell hovered shows that day's sessions; clicked opens the day drawer.
- `⚠` marks a day containing an auto-closed or edited session.
- `—` is a day not worked.
- **Dials/hr is the column that justifies the feature.** It only exists because
  attendance and output now live in the same row of `daily_stats`.

**Day drawer** — sessions for one person on one day, with the manager's controls:
edit a session's times, add a missing session, delete a spurious one. Every change asks
for a short reason and writes `work_session_adjustments`. The drawer shows the full edit
history beneath the sessions.

### 4. `/analytics` — restricted, gains two attendance views

Everything already specced stays (funnel, daily series, best calling hours, batch
quality, lost reasons) and becomes owner + team_lead only. Two new cards:

**Hours vs output** — per member, hours worked against dials and conversions. Answers
"who is efficient" separately from "who is present", which are different problems with
different fixes.

**Coverage vs connect rate** — the existing hour-of-day connect-rate bars, overlaid with
how many people were actually checked in at that hour. This directly answers *"are we
staffed at the hours that actually convert?"* — the strongest single insight the
attendance data unlocks, and impossible before it existed.

### 5. `/leaderboard` — everyone

Ranked by conversions → interested → dials, with the this week / this month / all time
toggle and streak badges. Names and those three numbers only. **No hours, no per-member
funnels, no attendance.** An agent must not be able to infer a teammate's schedule from
it.

---

## Edge cases — get these right

| Case | Handling |
| --- | --- |
| **Timezone** | Group by the *agent's* local date via `users.timezone`, computed at check-in and stored on the row. Never UTC, never the org zone. A session crossing midnight belongs to the day it started. |
| **Double check-in** | Prevented by the partial unique index. The action is idempotent: already open → return the existing session, don't error. |
| **Check out with nothing open** | No-op with a friendly message. Never an error toast. |
| **Forgotten check-out** | Cron closes sessions open longer than `autoCloseAfterHours` (12). Close at the user's last logged activity after `startedAt`; if there is none, at `startedAt`. Mark `auto_closed`, notify agent and manager. |
| **Client clock skew** | Every timestamp is set server-side. Never trust the browser clock, including for the local-date calculation — derive it from `users.timezone` on the server. |
| **Manager edit creating an overlap** | Reject on save. A user's sessions may never overlap. Validate against siblings on the same `localDate` and the adjacent days. |
| **Member deactivated** | Close any open session as part of `deactivateMember`. |
| **Agent in a different timezone from the org** | Already handled — `localDate` is per-user. The manager grid shows the agent's local day, labelled. |
| **Editing a session's start across midnight** | Recompute `localDate` on edit; a session must not silently move between days without the grid reflecting it. |

---

## Cron

Extend the existing jobs rather than adding new endpoints. All still behind `CRON_SECRET`.

| Schedule | Add |
| --- | --- |
| `0 * * * *` (hourly, exists for trials) | Auto-close stale sessions; notify agent + manager. |
| `0 18 * * *` (nightly, exists for `daily_stats`) | Fold the day's `work_sessions` into `daily_stats` — `workedSeconds`, `sessionCount`, `firstCheckInAt`, `lastCheckOutAt`. |

The nightly fold must be **idempotent** — it will be re-run after late corrections.
Upsert on `(user_id, date)`, recomputing from `work_sessions` rather than incrementing.

---

## Implementation order

Each step leaves the app working and shippable.

**A. Permission split** *(small, do it first — it unblocks everything else)*
- Add `assertCanViewTeamAnalytics` to `visibility.ts` + tests.
- `roles: ["owner", "team_lead"]` on the Analytics nav item in `shell/nav-config.ts`.
- New `/leaderboard` route using the existing `getLeaderboard()` query, all roles.

**B. Schema**
- Both tables, the `daily_stats` and policy columns, `pnpm db:generate`.
- Hand-add the partial unique index to the generated migration.
- Extend `scripts/seed.ts` with ~3 weeks of realistic sessions, including one
  auto-closed day and one manager-edited day so every state is visible in the UI.

**C. Self-service** *(the agent-facing half is now complete and useful on its own)*
- `src/lib/actions/attendance.ts` — `checkIn`, `checkOut`, `undoCheckIn`,
  `requestCorrection`. Zod-validated, guarded, `ActionResult` return.
- `src/lib/queries/attendance.ts` — `getOpenSession`, `getMyTimesheet(month)`,
  `getTeamPresence(teamId)`.
- The global check-in control in sidebar / mobile bar / Call Mode top bar.
- `/timesheet`.

**D. Manager surfaces**
- `/team` Live and Timesheets tabs, day drawer, correction actions with audit trail.
- `adjustSession`, `addSession`, `deleteSession` in the actions module.

**E. Cron**
- Auto-close step on the hourly job; `daily_stats` fold on the nightly one.

**F. Analytics integration**
- Hours-vs-output card, coverage-vs-connect-rate card, `dials/hr` column on `/team`.

---

## Deliberately not built

Called out so nobody adds them by accident:

- **No GPS, IP logging, screenshots, or idle detection.** The user asked to track hours,
  not to surveil people. If they later want location on check-in, that is a separate
  conversation with a consent surface, not a quiet column.
- **No payroll, overtime, or leave management.** Attendance is a record, not an HR system.
- **No approval workflow.** A manager corrects a session directly; the audit trail is
  what provides accountability. A request/approve queue is over-engineered for 5–10 people.
- **No agent-facing monthly totals.** Per the decision above. One tile away if wanted.

---

## Conventions reminder

Everything in `HANDOFF.md` still applies. The three that bite hardest here:

- A client component importing a `server-only` module is a build error — put shared
  constants in `src/lib/domain/*`, not in the query module.
- Use `inArray(col, arr)`, never `sql\`col = any(${arr})\``.
- Timestamps stored UTC, rendered through `src/lib/domain/dates.ts` with an explicit
  zone label. Duration formatting belongs in that module too — add `formatDuration()`
  there rather than inline in components.
