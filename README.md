# CallDesk

Lead management and cold-call tracking for a small outbound sales team selling an
**AI Receptionist** product. The sales motion it models: scrape leads → cold call →
get them interested → set up a **7-day free demo week** → convert at day 7.

Replaces a Google Sheet and a WhatsApp group. Mobile-first for the calling itself,
desktop for management. **Total recurring cost: $0** — every service is on a free tier.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript strict — no `any` |
| Styling | Tailwind CSS v4 (CSS-first tokens) + Radix primitives, shadcn-style |
| Database | Postgres — Supabase or Neon free tier in production, any Postgres locally |
| ORM | Drizzle + drizzle-kit migrations |
| Auth | Auth.js v5 (credentials + bcrypt) with an invite-token flow |
| Tables | TanStack Table v8 + TanStack Virtual |
| Charts | Recharts |
| Validation | Zod at every server boundary, React Hook Form for forms |
| Mutations | Server Actions; Route Handlers only for import / export / search / cron |
| Dates | `date-fns` + `date-fns-tz`; every timestamp stored `timestamptz` in UTC |
| Hosting | Vercel Hobby + Vercel Cron |
| AI (optional) | OpenRouter free models behind one swappable adapter — the app is fully usable with it off |
| Voice | Browser Web Speech API — free, no service |

The database driver is chosen at runtime: `@neondatabase/serverless` over HTTP when
`DATABASE_URL` points at Neon, `node-postgres` everywhere else — Supabase, local
Postgres, and every script. Same Drizzle schema either way.

---

## What's in it

| Route | For | What it does |
| --- | --- | --- |
| `/today` | everyone | The landing page. Overdue → due today → trials ending → trials needing a decision → new leads, with progress rings against your daily targets. |
| `/call` | everyone | Full-screen mobile Call Mode. One lead at a time, giant outcome buttons, `tel:` and `wa.me` links, live session counters, one-tap 7-day demo week. Queued in the brief's priority order and filtered to the lead's own calling window. |
| `/leads` | everyone | The daily driver. Virtualised table, inline optimistic editors, URL-backed filters, 7 saved views, bulk actions, CSV export, keyboard nav, and the detail drawer. |
| `/board` | everyone | Kanban across the open pipeline. Drag, or use the Back/Forward buttons on touch. |
| `/trials` | everyone | The demo-week tracker: five columns, a day-track per active trial, 48-hour and stalled-decision alerts, conversion by caller and by source sheet. |
| `/analytics` | everyone | Funnel, dials by caller, connect-rate trend, best calling hours, source-sheet quality, lost reasons, and the leaderboard. Every chart has a table view. |
| `/team` | lead + owner | Sortable per-member performance, drill-through to anyone's leads, and two heatmaps — when the team calls vs. when people answer. |
| `/import` | lead + owner | The migration path off Sheets. See below. |
| `/settings` | mixed | Org and calling window, team and the visibility matrix, custom fields, do-not-call list, your profile. Agents see only their profile. |

### The importer

`/import` is a first-class feature, not an afterthought: drag-drop CSV/XLSX **or paste
straight out of Google Sheets**, auto-detected column mapping remembered per user,
phone normalisation to E.164, and a preview that sorts every row into five buckets —
new, already in CallDesk, on the do-not-call list, repeated within the sheet, and
unusable. The two buckets with a real decision behind them get a choice; the rest
explain themselves. Assignment is single, round-robin or read from a column, and a
batch can be undone entirely right up until someone logs a call against its leads.

The preview and the commit share one classification function, so what the review screen
promises is exactly what gets written.

---

## Getting started

```bash
# 1. Install
pnpm install          # or npm install

# 2. Configure
cp .env.example .env  # then fill in DATABASE_URL and AUTH_SECRET

# 3. Create the schema
pnpm db:migrate       # applies drizzle/*.sql

# 4. (optional) Load ~240 realistic sample leads across the whole funnel
pnpm db:seed

# 5. Run
pnpm dev              # http://localhost:3000
```

### Environment variables

Every variable is documented inline in [`.env.example`](./.env.example). The two
required ones:

- `DATABASE_URL` — Supabase's **transaction pooler** URI (or Neon's pooled string) in
  production; any Postgres 14+ locally.
- `AUTH_SECRET` — `openssl rand -base64 32`.

`OPENROUTER_API_KEY` is optional by design. Leave it blank and every AI surface
degrades to a plain manual control; nothing breaks.

### Creating the first owner account

Visit `/setup`. That route is only reachable while the `users` table is empty — it
creates the organization, the first team, and you as `owner`, then redirects to sign in.
Everyone else joins through an invite link generated in **Settings → Team** (copy the
link and send it yourself; no email service is needed, which keeps the cost at $0).

### Sample logins after `pnpm db:seed`

Password for all of them: `calldesk123`

| Role | Email |
| --- | --- |
| owner | `zainab@calldesk.test` |
| team_lead | `bilal@calldesk.test` |
| agent | `sara@calldesk.test` |
| agent | `usman@calldesk.test` |
| agent | `ayesha@calldesk.test` |
| agent | `hamza@calldesk.test` |

The seed also creates one directional visibility link — Sara can see Usman's leads,
Usman **cannot** see Sara's — so the asymmetry is visible immediately.

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:push` | Push schema directly (dev only) |
| `pnpm db:seed` | Wipe and reseed sample data (`-- --keep` to append) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm test` | Vitest — permission/visibility tests against real Postgres, plus the AI client contract |

---

## Deploying to Vercel

### With Supabase (recommended)

Supabase is used purely as Postgres — not its Auth, not its Storage. Auth.js already
owns sessions and the app owns its own schema, so nothing in Supabase needs configuring
beyond the database itself.

1. In your Supabase project: **Settings → Database → Connection string**. Take two URIs,
   both with your database password substituted in:
   - **Transaction pooler**, port `6543` → `DATABASE_URL`. Serverless functions open
     many short-lived connections and this is what survives that.
   - **Direct connection**, port `5432` → `DIRECT_URL`. Migrations run DDL, which does
     not belong on a transaction pooler.
2. Set `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` and `CRON_SECRET` in Vercel →
   Project → Settings → Environment Variables. `AUTH_URL` is inferred on Vercel.
3. Run `pnpm db:migrate` once locally with those variables set — Vercel's build step
   does not migrate. `pnpm db:seed` is optional sample data.
4. Deploy, then visit `/setup` to create the owner account.

Drizzle only issues named prepared statements when you call `.prepare()`, which this
codebase never does, so every query here is compatible with transaction-mode pooling.

**Do not skip `0002_rls_lockdown`.** Supabase serves every `public` table over PostgREST
to the `anon` key — which is public by design and ships in browser bundles — so without
it, anyone with that key can read and write your leads straight past the permission
layer. The migration turns RLS on with no policies, which denies anon and authenticated
everything. The app connects as `postgres` (owner, BYPASSRLS) and is unaffected. Supabase
will then report 17 INFO lints saying "RLS enabled, no policy": that is the intended
state, not a problem to fix.

**Neon works too** — put its pooled string in `DATABASE_URL`, leave `DIRECT_URL` blank,
and the driver switches to Neon's HTTP transport automatically.

### Scheduled jobs

Four jobs, all behind a constant-time `CRON_SECRET` check. With the secret unset they
refuse every request, so a misconfigured deploy fails closed.

| Route | Wants | Does |
| --- | --- | --- |
| `/api/cron/trials` | hourly | Demo-week transitions and the day 1/4/6/7 cadence, plus ending-soon alerts. |
| `/api/cron/follow-ups` | every 30 min | Overdue follow-up notifications, once per lead per day. |
| `/api/cron/nightly` | daily 18:00 UTC | `daily_stats` rollup, statistical lead rescoring, each org's give-up rule, the manager brief. |
| `/api/cron/weekly` | Sundays | Manager rollup and a database-size check against the free tier. |

**Vercel Hobby allows two cron jobs, each at most once a day**, which the hourly and
half-hourly schedules exceed. So there are two ways to run these, and both are $0:

- **Out of the box** — `vercel.json` schedules the nightly and trial jobs daily. Nothing
  to configure; the sub-daily jobs simply do not run.
- **The real schedules** — [`.github/workflows/cron.yml`](./.github/workflows/cron.yml)
  drives all four on the schedules above. Set the `CALLDESK_URL` and `CRON_SECRET`
  repository secrets and it works; delete the file if you move to Vercel Pro and put all
  four schedules in `vercel.json` instead.

Every job is safe to run twice: the rollup upserts, the transitions are guarded by state,
and notifications de-duplicate per lead per day. A late or doubled trigger cannot corrupt
anything or spam anyone.

---

## Permission model

Three roles, scoped per team:

- **`owner`** — everything, across every team in the org.
- **`team_lead`** — every lead belonging to any member of their team; can import,
  bulk-assign, reassign and delete within that team.
- **`agent`** — only leads assigned to them, plus any user they hold an explicit
  `lead_visibility_links` row for.

**Visibility is asymmetric.** A team lead seeing an agent's leads grants that agent
nothing in return, and cross-visibility between two agents needs an explicit link
created by an owner or team lead. One row grants exactly one direction.

This lives in a single function, `visibleUserIds(userId, teamId)` in
[`src/lib/auth/visibility.ts`](./src/lib/auth/visibility.ts). **Every lead read in the
app goes through it** — `listLeads`, the ⌘K search, the CSV export, the call queue, the
analytics scopes. Mutations go through `assertCanEditLead` / `assertCanManageTeam`,
which throw rather than returning a boolean, so a forgotten check is a crash and not a
leak.

---

## AI features (all optional)

Everything lives behind [`src/lib/ai/client.ts`](./src/lib/ai/client.ts) — one plain
fetch to OpenRouter, a Zod-validated JSON reply, and a typed failure instead of an
exception. **It never throws and never blocks a save.** Leave `OPENROUTER_API_KEY` blank
and the affordances simply do not render; nothing else changes.

Only **free** (`:free`) models are used, so the $0 constraint holds. Three things about
the free tier are worth knowing, because all three were found by testing against a live
key rather than by reading docs:

- **Requests send a chain of up to three models, not one.** Free models rate-limit hard
  and independently; OpenRouter serves the first that answers. A single id makes every
  AI surface flaky. OpenRouter rejects more than three, and the code caps it there.
- **Reasoning is turned off** (`reasoning: { enabled: false }`). Several free models
  narrate their thinking into `content` rather than the separate `reasoning` field, so
  `max_tokens` ran out mid-thought and the JSON never arrived. Turning it off fixed
  every feature and made the calls markedly faster.
- **Each suggested field is validated independently.** A model that returns `"Warm"`
  for a status still gets its summary and follow-up date kept; only the bad field is
  dropped. Casing and spacing are normalised before the enum check.

Features:

- **Note → structured update.** Type or dictate what happened and get the fields back as
  chips you can untick before applying. It suggests; it never writes. Applying goes
  through the same guard, schema and activity log as a manual edit.
- **Objection coach.** Rebuttals drawn from your own converted leads, and it tells you
  whether it found any or fell back on general reasoning.
- **Follow-up drafting.** A WhatsApp or email draft from the lead's notes and trial day,
  editable before `wa.me` opens. Nothing sends from the app.
- **Manager brief.** Prose wrapped around the numbers the nightly job already computed.
  The numbers are the brief; if the model is slow or absent you get them plainly.
- **Lead scoring** is deliberately *not* a model call — it is pure statistics in the
  nightly cron, exactly as the brief specifies. It drives Call Mode's ordering.
- **Voice dictation** is the browser's Web Speech API. Free, no service, no key.

To check a model change against the real API:

```bash
AI_LIVE=1 pnpm test tests/ai-live.test.ts   # opt-in; costs rate-limit budget
AI_DEBUG=1 ...                              # also dumps raw replies, for prompt tuning
```

The Zod schema is the real boundary: a model that invents a status outside our enum
fails there and you fall back to typing it yourself. A wrong suggestion is worse than
none.

---

## Storage

The team is 5–10 people at ~3,000 leads each, so the working set is roughly 15–30k lead
rows and a few hundred thousand activity rows — comfortably inside Neon's 0.5 GB free
tier. The guard rails are still in place rather than bolted on later:

- `activities.body` is truncated to 4,000 characters on write; no blobs in Postgres.
- `is_archived` on leads, excluded from every default query.
- Analytics read the pre-aggregated `daily_stats` table, never a scan of `activities`.
- **Settings → General** shows live database size against the 512 MB ceiling, and the
  weekly job warns in-app once you pass 75%.

If the tier is ever outgrown, the same Drizzle schema runs unchanged on Neon free or
self-hosted Postgres — only `DATABASE_URL` changes.
