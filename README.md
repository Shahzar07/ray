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
| Database | Postgres — Neon free tier in production, any Postgres locally |
| ORM | Drizzle + drizzle-kit migrations |
| Auth | Auth.js v5 (credentials + bcrypt) with an invite-token flow |
| Tables | TanStack Table v8 + TanStack Virtual |
| Charts | Recharts |
| Validation | Zod at every server boundary, React Hook Form for forms |
| Mutations | Server Actions; Route Handlers only for import / export / search / cron |
| Dates | `date-fns` + `date-fns-tz`; every timestamp stored `timestamptz` in UTC |
| Hosting | Vercel Hobby + Vercel Cron |
| AI (optional) | Groq free tier behind one swappable adapter — the app is fully usable with it off |
| Voice | Browser Web Speech API — free, no service |

The database driver is chosen at runtime: `@neondatabase/serverless` over HTTP when
`DATABASE_URL` points at Neon, `node-postgres` otherwise. Same Drizzle schema either
way, so the app also runs unchanged on Supabase free or a self-hosted Postgres.

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

- `DATABASE_URL` — Neon's **pooled** connection string in production; any Postgres 14+ locally.
- `AUTH_SECRET` — `openssl rand -base64 32`.

`GROQ_API_KEY` is optional by design. Leave it blank and every AI surface degrades to a
plain manual control; nothing breaks.

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
| `pnpm test` | Vitest — permission and visibility tests |

---

## Deploying to Vercel

1. Create a Neon project (free tier) and copy the **pooled** connection string.
2. Import this repo into Vercel.
3. Set `DATABASE_URL`, `AUTH_SECRET`, and `CRON_SECRET` in Project → Settings →
   Environment Variables. `AUTH_URL` is inferred on Vercel.
4. Run `pnpm db:migrate` once against the Neon URL (locally, with `DATABASE_URL` pointed
   at Neon) — Vercel's build step does not migrate.
5. Deploy, then visit `/setup` to create the owner account.

Cron jobs are declared in `vercel.json` and every cron route checks `CRON_SECRET`.

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

## Storage

The team is 5–10 people at ~3,000 leads each, so the working set is roughly 15–30k lead
rows and a few hundred thousand activity rows — comfortably inside Neon's 0.5 GB free
tier. The guard rails are still in place rather than bolted on later:

- `activities.body` is truncated to 4,000 characters on write; no blobs in Postgres.
- `is_archived` on leads, excluded from every default query.
- Analytics read the pre-aggregated `daily_stats` table, never a scan of `activities`.

If the tier is ever outgrown, the same Drizzle schema runs unchanged on Supabase free or
self-hosted Postgres — only `DATABASE_URL` changes.
