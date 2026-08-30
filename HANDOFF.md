# CallDesk — build handoff

State of the build, and exactly where to pick it up. Read this before writing code.

**Verified at handoff:** `pnpm typecheck` clean · `pnpm build` succeeds (0 errors) ·
`pnpm test` 30/30 passing · every route in the app rendered in a real browser as both
an owner and an agent, with no console errors · all four cron jobs run green against a
seeded Postgres.

---

## Scope decision the user made

The original brief sized the app for "3 users at launch, up to 30 within 12 months."
**The user corrected this: it is a 5–10 person team.** Everything is designed for that:

- Seed creates 6 people (1 owner, 1 team lead, 4 agents) and 240 leads.
- Working set is ~15–30k leads, comfortably inside Neon's 0.5 GB free tier, so the
  archival/partitioning machinery in the brief's storage section was **deliberately not
  built**. The cheap guard rails are in (README → Storage), and Settings → General now
  shows live database size against the ceiling. Do not add the `activities_archive` job
  unless the user asks.
- Do not over-engineer for 30 users. Round-robin loops, per-user queries and the
  in-memory queue ranking are all fine at this size and are written to be obvious rather
  than clever.

The user's other explicit priority: **"professional and next level UI modern dashboard."**
The design system is the load-bearing part of this repo. Match it; don't reinvent it.

---

## What is built

Everything in the brief's Phases 1–5 except the two items under "Not built" below.

### Backend
Postgres on **Supabase** (transaction pooler for the app on 6543, `DIRECT_URL` on 5432
for migrations — DDL does not belong on a transaction pooler). Supabase is used purely
as Postgres: not its Auth, not its Storage. Neon still works unchanged by swapping
`DATABASE_URL`; the driver is picked from the URL.

### Foundation
- Next.js 15 App Router, TypeScript strict, **no `any` anywhere**.
- Tailwind v4 CSS-first design tokens in `src/app/globals.css` — full light + dark
  palettes in OKLCH, layered surfaces, semantic tone tokens, shadows, keyframes.
- Drizzle schema, all 17 tables from the brief + `invites`. Two migrations committed
  (`0000_*` the schema, `0001_*` the org cadence columns).
- Dual driver: Neon HTTP in production, node-postgres locally/scripts, chosen at runtime
  from `DATABASE_URL`. One `Database` type for the whole app.
- Auth.js v5, credentials + bcrypt, JWT sessions, invite-token flow, edge middleware gate.
- `pnpm db:migrate` and `pnpm db:seed` both work; seed produces a realistic funnel with
  45 days of `daily_stats` so the charts have data.

### Permission layer — the security core
`src/lib/auth/visibility.ts` is the single entry point: `visibleUserIds()`,
`leadAccess()`, `assertCanEditLead()`, `assertCanViewLead()`, `assertCanManageTeam()`.
Every lead read and every mutation routes through it. `tests/visibility.test.ts` — 22
tests against real Postgres — pins the asymmetry, the cross-team boundary, the
cross-org boundary and the agent read-only-on-peers rule.

**Rule for whoever continues: never query `leads` without going through
`visibleUserIds` / `buildWhere`. There is currently no bypass in the codebase. Keep it
that way.** The newer screens follow it: `/board` intersects a posted assignee with
`visibleUserIds` before it reaches the query, and `/import` re-derives every mapping
target server-side from the same table the UI offered.

### Screens — all done
| Route | Notes |
| --- | --- |
| `/login`, `/setup`, `/invite/[token]` | Split-screen auth layout |
| `/today` | Progress rings, five prioritised sections, sparkline |
| `/call` | Full-screen mobile Call Mode, brief's exact queue order, calling-window filter |
| `/leads` | Virtualised table, inline optimistic editors, saved views, bulk bar, drawer |
| `/board` | Kanban, native drag + touch-friendly Back/Forward, days-in-stage |
| `/trials` | Five columns, day-track, 48h and stalled alerts, conversion by caller/sheet |
| `/analytics` | 6 charts + leaderboard, one range filter, table view on every chart |
| `/team` | Sortable performance table, drill-through, two activity heatmaps |
| `/import` | Full wizard: upload/paste → map → review → done, with batch undo |
| `/settings` | General, Team & access + visibility matrix, fields, DNC, profile |

### Cron
Four routes under `/api/cron/*`, all behind a constant-time `CRON_SECRET` check that
**fails closed** when the secret is unset. Jobs are idempotent — safe to run twice.
`vercel.json` carries the two Hobby-compatible daily schedules;
`.github/workflows/cron.yml` drives all four on the brief's real schedules for free.
See README → Scheduled jobs.

### AI
`src/lib/ai/client.ts` is the single door: one plain fetch to **OpenRouter free
models**, Zod-validated JSON, typed failures, **never throws, never blocks a save**. Features: note→structured update
(suggests, never writes), objection coach grounded in the team's own won leads,
follow-up drafting, and prose for the nightly brief. Lead scoring is deliberately pure
statistics in the nightly cron, per the brief. `tests/ai-client.test.ts` pins the
client's contract against every failure mode with a mocked fetch — no key needed.

---

## Not built — pick up here

Only two things from the brief remain, both deliberately left last.

1. **Postgres RLS.** Not applied, and there is no script for it. This got *more*
   feasible with the move to Supabase: the app now runs on node-postgres, so a
   `SET LOCAL app.user_id` inside a transaction is available in a way it never was over
   Neon's HTTP driver. It is still defence in depth, not the primary control — the
   application layer is the real guard and is the thing with 22 tests behind it.

2. **PWA offline queue.** `manifest.webmanifest` and the icon exist and are linked, so
   the app is installable. `next-pwa` is not installed, and there is no service worker
   or write queue. The brief wants a caller in a weak-signal spot to keep their note.
   Ask before adding `next-pwa` — it is outside the brief's stack list.

### Smaller things worth knowing
- **Two lockfiles, one decision outstanding.** The repo commits `package-lock.json` but
  every script is `pnpm`, so `pnpm install` drops a `pnpm-lock.yaml` beside it. That is
  now gitignored, which changes nothing about the build and keeps `package-lock.json`
  authoritative — Vercel picks the package manager by whichever lockfile it finds, so
  shipping both is a real hazard. **This is a deferral, not an answer.** If the team
  wants pnpm (and the scripts suggest they do), delete the ignore rule and
  `package-lock.json` together in one deliberate commit.
- **The AI path is verified end to end against the live API** on free models. Three
  free-tier realities are baked into the client, each found by testing rather than by
  reading docs, and each will bite anyone who "simplifies" them away:
  1. Send a **chain of up to three models**, not one — free models rate-limit hard and
     independently. More than three is a 400 from OpenRouter; the code caps it.
  2. **`reasoning: { enabled: false }`** is load-bearing. Several free models narrate
     their thinking into `content`, so `max_tokens` ran out mid-thought and no JSON ever
     arrived (`finish_reason: "length"`). This broke every feature until it was set.
  3. Suggested fields are **validated independently** (`lenient()` + `.catch`). A model
     that returns `"Warm"` as a status still keeps its summary and follow-up date.
  `AI_LIVE=1 pnpm test tests/ai-live.test.ts` re-checks all four features against the
  real API; `AI_DEBUG=1` dumps raw replies for prompt tuning.
- **No AI voice.** Server-side transcription was considered and dropped: OpenRouter
  requires a minimum account balance for *any* audio request, even against a `:free`
  model, so it is not a $0 path. Browser dictation (Web Speech) already covers it and
  costs nothing. Every Gemini model on OpenRouter is paid too — there is no free
  Gemini Flash, despite the name suggesting otherwise.
- **Chart palette caveat.** `SERIES_COLORS` passes a colour-blindness and contrast audit
  in light mode with two warnings that the table view on every chart discharges. In dark
  mode three tokens sit outside the ideal lightness band for a dark surface. It reads
  fine and I left the design system alone deliberately, but if charts ever get a
  refresh, that is the thing to revisit.
- `/analytics` funnel, batch quality and lost reasons are **state snapshots**, not
  range-scoped, and say "all time" on their face. Don't wire them to the range filter
  without also making them historical — a filter that silently does nothing is worse
  than no filter.

---

## Conventions to follow

- **Colour**: never write a raw colour. Use the semantic tokens (`bg-surface`,
  `text-strong`, `border-line`, `bg-accent-soft`, …) and the `Tone` system in
  `src/lib/domain/constants.ts`. One `<StatusBadge>`, one colour map, everywhere.
  Charts use `SERIES_COLORS`; colour follows the **entity**, never its rank, so
  filtering a series out never repaints the survivors.
- **New UI**: check `src/components/ui/` first — the primitive probably exists. Charts
  go through `src/components/charts/chart-kit.tsx` so they share header, axes, tooltip
  and the table view.
- **Reads**: add to `src/lib/queries/*`, mark `import "server-only"`, and go through the
  visibility layer. If a client component needs a constant from a server module, move
  the constant to `src/lib/domain/*` — importing a `server-only` module from a client
  component is a build error, and it bit me again on `/analytics` (that is why
  `lib/domain/ranges.ts` exists).
- **Writes**: server action in `src/lib/actions/*`, Zod schema in `schemas.ts`,
  permission guard first, then `recordActivity()`. Return `ActionResult`, never throw to
  the client.
- **Activities are append-only.** `src/lib/actions/activity.ts` is the only writer and
  exposes no update or delete. `recordActivities()` is the bulk version for the importer
  and the cron jobs — same rule, one round trip.
- **AI never gets a privileged path.** Suggestions are applied through the same guarded
  actions a manual edit uses. Nothing is ever written without a tap.
- **Dates**: store UTC, render through `src/lib/domain/dates.ts` with an explicit zone.
- **Phones**: `normalisePhone()` on every write; dedupe on the E.164 value.
- **Drizzle**: use `inArray(col, arr)`, never ``sql`col = any(${arr})` `` — the array
  binds as separate positional params and the query fails at runtime.
- Ask the user before adding a dependency outside the brief's stack list. Added beyond
  it so far, and why: `geist` (self-hosted font), `libphonenumber-js` (E.164),
  `papaparse` + `xlsx` (the importer), `pg` (local/scripts driver), `tailwindcss-animate`.
  Drag-and-drop on `/board` is native HTML5 specifically to avoid adding another one.

---

## Local development notes

Any Postgres 14+ works; `DATABASE_URL` picks the driver. `pnpm test` needs
`DATABASE_URL` set and creates/destroys its own scratch org, so it is safe against a
dev database.

Three traps worth knowing:

1. **Don't run `pnpm build` while `pnpm dev` is running.** They share `.next` and the
   dev server starts 500ing on every route. Kill dev, `rm -rf .next`, restart.
2. **Call Mode's queue looks empty at night.** That is the calling-window filter working
   — it only offers leads whose *own local time* is inside the org's window. Widen it in
   Settings → General, or use `?lead=<id>`, which bypasses the check.
3. **`server-only` breaks Vitest.** It is a Next build-time marker with no runtime
   module; `vitest.config.ts` aliases it to `tests/stubs/server-only.ts`. Keep the
   marker on server modules rather than removing it to make a test pass.
