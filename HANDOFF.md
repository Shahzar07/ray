# CallDesk — build handoff

State of the build, and exactly where to pick it up. Read this before writing code.

**Verified at handoff:** `pnpm typecheck` clean · `pnpm build` succeeds (0 errors) ·
`pnpm test` 22/22 passing · dev server renders every route below against a seeded
Postgres.

---

## Scope decision the user made

The original brief sized the app for "3 users at launch, up to 30 within 12 months."
**The user corrected this: it is a 5–10 person team.** Everything is designed for that:

- Seed creates 6 people (1 owner, 1 team lead, 4 agents) and 240 leads.
- Working set is ~15–30k leads, comfortably inside Neon's 0.5 GB free tier, so the
  archival/partitioning machinery in the brief's storage section was **deliberately not
  built**. The cheap guard rails are in (see README → Storage). Do not add the
  `activities_archive` job unless the user asks.
- Do not over-engineer for 30 users. Round-robin loops, per-user queries and the
  in-memory queue ranking are all fine at this size and are written to be obvious rather
  than clever.

The user's other explicit priority: **"professional and next level UI modern dashboard."**
The design system is the load-bearing part of this repo. Match it; don't reinvent it.

**A second scope change landed after the first push:** an attendance layer (agents check
in / check out, managers see who is working and their timesheets) plus a permission
change — team analytics becomes owner + manager only, while the leaderboard stays visible
to everyone. This reverses the original brief's "analytics visible to all". The full
design is specced in [`docs/ATTENDANCE.md`](./docs/ATTENDANCE.md) — schema, permission
matrix, screens, edge cases and an ordered build plan. **Read it before touching
`/analytics`, `/team`, or `nav-config.ts`.** Nothing in it is built yet.

---

## What is built and working

### Foundation
- Next.js 15 App Router, TypeScript strict, **no `any` anywhere**.
- Tailwind v4 CSS-first design tokens in `src/app/globals.css` — full light + dark
  palettes in OKLCH, layered surfaces, semantic tone tokens, shadows, keyframes.
- Drizzle schema, all 17 tables from the brief + `invites`
  (`src/lib/db/schema.ts`). Migration generated and committed (`drizzle/0000_*.sql`).
- Dual driver: Neon HTTP in production, node-postgres locally/scripts, chosen at runtime
  from `DATABASE_URL` (`src/lib/db/client.ts`). One `Database` type for the whole app.
- Auth.js v5, credentials + bcrypt, JWT sessions, invite-token flow, edge middleware gate.
- `pnpm db:migrate` and `pnpm db:seed` both work; seed produces a realistic funnel with
  45 days of `daily_stats` so charts have data.

### Permission layer — the security core, done and tested
`src/lib/auth/visibility.ts` is the single entry point:
`visibleUserIds()`, `leadAccess()`, `assertCanEditLead()`, `assertCanViewLead()`,
`assertCanManageTeam()`. Every lead read and every mutation already routes through it.
`tests/visibility.test.ts` — 22 tests against real Postgres — pins the asymmetry, the
cross-team boundary, the cross-org boundary and the agent read-only-on-peers rule.

**Rule for whoever continues: never query `leads` without going through
`visibleUserIds` / `buildWhere`. There is currently no bypass in the codebase. Keep it
that way.**

### Screens finished
| Route | State |
| --- | --- |
| `/login`, `/setup`, `/invite/[token]` | Done — split-screen auth layout |
| `/leads` | Done — the daily driver, see below |
| `/today` | Done — progress rings, five prioritised sections, sparkline |
| `/call` | Done — full-screen mobile Call Mode, see below |

**`/leads`** — virtualised TanStack table (2,000 rows loaded, `@tanstack/react-virtual`),
sticky header, sortable columns, 14 toggleable columns persisted to `localStorage`,
7 built-in saved views, multi-select filters that live in the URL (shareable), debounced
search, `j`/`k`/`Enter`/`x`/`/` keyboard navigation, `?` shortcut sheet, floating bulk
action bar (status / assign / tag / follow-up / archive / DNC), CSV export of the exact
current view, and inline editors for status, interest, follow-up date and assignee —
each optimistic with a toast rollback and an Undo action.

**Lead drawer** — opens from any row (`?lead=<id>` in the URL). Three tabs: Activity
(note composer with Web Speech dictation + append-only timeline), Demo week (day-N
progress, the 1/4/6/7 cadence, and the lifecycle buttons), Details. Shows the
duplicate-contact warning banner when someone else dialled the same number in 30 days.

**`/call`** — queue ordered exactly as the brief specifies (overdue → due today → trial
check-ins → hot never-attempted → new by score), filtered to leads whose **own local
time** is inside the org's calling window. Giant tap targets, `tel:` and `wa.me` deep
links, live session counters vs. daily target, keyboard `1`–`6`/`s`, duplicate warning,
and the Answered panel: interest, status, dictated note, follow-up chips, and the
one-tap **Start the 7-day demo week** button that sets the trial live.

### Shell & design system
- `src/components/ui/*` — button, badge, card, input/field, select, checkbox, switch,
  tabs, separator, avatar (+stack), dialog, sheet, popover, tooltip, dropdown, toast
  (with Undo actions), progress ring/bar, stat tile, empty state, skeletons, sparkline,
  Kbd, status/interest/trial/outcome/role badges.
- `src/components/shell/*` — sidebar with grouped nav + role filtering, mobile bottom tab
  bar + drawer, ⌘K command palette (nav + live lead search), notification bell, theme
  toggle (light/dark/system), `PageHeader`/`PageBody`.
- `g`-then-letter navigation shortcuts wired globally.

### Server actions (all Zod-validated, all permission-guarded)
`src/lib/actions/` — `leads.ts` (update, logCall, addNote, trialAction, bulkUpdate,
createLead, DNC), `auth.ts` (sign in/out, first owner, invites, profile, password),
`admin.ts` (visibility matrix, roles, targets, teams, org settings, custom fields),
`activity.ts` (the **only** writer to `activities` — append-only, no update/delete path
exists), `schemas.ts` (every input boundary).

### API routes
`/api/auth/[...nextauth]`, `/api/leads/[id]` (drawer payload), `/api/search` (⌘K),
`/api/export` (CSV).

---

## What is NOT built yet — pick up here

In the order I'd do them:

1. **`/import`** — the highest-value gap. It is the migration path off Sheets and the
   brief calls it a first-class feature. Needs: drag-drop CSV/XLSX **or paste from
   Google Sheets**, auto column detection + user mapping (remembered per user), phone
   normalisation to E.164 (`normalisePhone` already exists and handles the messy
   `'03001234567` cases), dedupe against existing leads **and the DNC list** with a
   preview table offering skip / update-existing / import-anyway per group, assignment
   (single / round-robin / by-column), batch tag + source note, post-import summary and
   **undo entire batch** while no activity has been logged against its leads.
   `import_batches` table, `papaparse` and `xlsx` are already installed and wired into
   the schema; `roundRobinAssign` already exists in `actions/leads.ts`.

2. **`/settings`** — Teams & Members (invite links, roles, the "who can see whose leads"
   matrix UI), custom fields, pipeline/cadence/calling-window/targets, DNC list, profile.
   **All the server actions for these already exist and are tested-by-construction** in
   `actions/admin.ts` and `actions/auth.ts` — this is almost purely UI work. The
   visibility matrix is the piece worth designing carefully; `toggleVisibility` is ready.

3. **`/trials`** — the demo-week tracker. `getTrialBoard()` and
   `getTrialConversionByUser()` in `queries/dashboard.ts` are written and return the five
   columns already. Needs the timeline/column UI, the 48h and >2-days-no-decision alerts,
   and conversion rate by caller and by source batch.

4. **Attendance — permission split first.** Step A of `docs/ATTENDANCE.md` is small and
   unblocks the rest: add `assertCanViewTeamAnalytics` to `visibility.ts`, restrict the
   Analytics nav item to `["owner", "team_lead"]`, and add a `/leaderboard` route (all
   roles) on the existing `getLeaderboard()` query. Do this before building `/analytics`
   so it is built behind the right guard from the start.

5. **Attendance — the rest.** Steps B–F of `docs/ATTENDANCE.md`: `work_sessions` +
   `work_session_adjustments` tables, the global check-in control, `/timesheet`, the
   `/team` Live and Timesheets tabs, the cron auto-close and `daily_stats` fold. The
   spec has the exact schema, the partial unique index that prevents double check-in,
   and every edge case worth getting right.

6. **`/analytics`** — every query is already written in `queries/dashboard.ts`:
   `getFunnel`, `getDailySeries`, `getBestCallingHours`, `getBatchQuality`,
   `getLostReasons`, `getLeaderboard`. Recharts v3 is installed. **Now owner +
   team_lead only** — see item 4. Use `SERIES_COLORS` from `domain/constants.ts` — do
   not invent chart colours.

7. **`/team`** — `getTeamPerformance()` and `getActivityHeatmap()` are written. Needs the
   sortable member table, date range picker, drill-through, and the hour × weekday
   heatmap — plus the two attendance tabs from the spec.

8. **`/board`** — kanban. `getPipelineCounts()` exists. Drag-to-change-status should call
   the existing `updateLead` action.

9. **Cron jobs** — none written yet. Four are specified (trial transitions hourly,
   overdue notifications every 30m, nightly `daily_stats` aggregation + lead scoring +
   cadence auto-Lost, weekly rollup), and attendance adds two steps to the existing
   hourly and nightly jobs rather than new endpoints — see `docs/ATTENDANCE.md`. Every route must check `CRON_SECRET`. A
   `vercel.json` still needs to be created. `nextTrialTask()` in `domain/trials.ts` is
   the helper the hourly job wants.

10. **AI features** — nothing built. `GROQ_API_KEY` is already optional in `env.ts` and
   `aiEnabled` is exported. Build `lib/ai/client.ts` as a plain fetch wrapper with a
   Zod-validated response and a graceful fallback. Start with **note → structured
   update** (highest value). Lead scoring **phase 1 must be pure statistics, no model
   call** — the `leads.score` column exists and already drives Call Mode ordering; it is
   currently only set by the seed. Voice dictation is already done
   (`lib/hooks/use-dictation.ts`) and feeds the note boxes.

11. **Postgres RLS** — not applied, and there is no script for it yet. Honest caveat to
   carry forward before you build one: the Neon HTTP driver opens a fresh connection
   per query, so there is no session in which to `SET app.user_id` — per-user RLS is only
   practical on the node-postgres path (self-hosted / Supabase pooler). Document that
   rather than pretending otherwise.

12. **PWA offline queue** — `manifest.webmanifest` and the icon exist and are linked;
    `next-pwa` is not installed and there is no service worker or write queue.

---

## Conventions to follow

- **Colour**: never write a raw colour. Use the semantic tokens (`bg-surface`,
  `text-strong`, `border-line`, `bg-accent-soft`, …) and the `Tone` system in
  `src/lib/domain/constants.ts`. One `<StatusBadge>`, one colour map, everywhere.
- **New UI**: check `src/components/ui/` first — the primitive probably exists. Sizes,
  radii and focus rings are already consistent; match them rather than adding variants.
- **Reads**: add to `src/lib/queries/*`, mark `import "server-only"`, and go through the
  visibility layer. If a client component needs a constant from a query module, move the
  constant to `src/lib/domain/*` — importing a `server-only` module from a client
  component is a build error, and it bit me three times.
- **Writes**: server action in `src/lib/actions/*`, Zod schema in `schemas.ts`, permission
  guard first, then `recordActivity()`. Return `ActionResult`, never throw to the client.
- **Dates**: store UTC, render through `src/lib/domain/dates.ts` with an explicit zone.
- **Phones**: `normalisePhone()` on every write; dedupe on the E.164 value.
- **Drizzle**: use `inArray(col, arr)`, never `sql\`col = any(${arr})\`` — the array binds
  as separate positional params and the query fails at runtime.
- Ask the user before adding a dependency outside the brief's stack list. The ones added
  beyond it so far, and why: `geist` (self-hosted font, no build-time network),
  `libphonenumber-js` (E.164 normalisation), `papaparse` + `xlsx` (the importer),
  `pg` (local/scripts driver), `tailwindcss-animate`.

---

## Local development notes

The dev database used while building was a local Postgres on port 5433, not Neon. Both
work; `DATABASE_URL` decides. `pnpm test` needs `DATABASE_URL` set and creates/destroys
its own scratch org, so it is safe against a dev database.

One thing to know when testing Call Mode: the queue filters to leads whose **local time**
is inside the org's calling window (default 09:00–20:00). If the queue looks empty at
night, that is the feature working — widen the window in the `organizations` row or use
`?lead=<id>`, which bypasses the window check.
