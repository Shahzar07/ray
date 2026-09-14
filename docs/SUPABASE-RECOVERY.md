# Supabase CRM recovery

The complete CRM handoff identifies Supabase project `ldplldsqjnkyjnbfboiw`,
"raynaters dashboard", as the original backend. This requires live confirmation.
The user-supplied Neon connection works but has no CRM users or leads tables.
No data has been copied, deleted or replaced.

This branch builds on `5141f3e` from `claude/modern-dashboard-ui-okdhej`, retaining
imports, exports, pipeline board, trials, settings, AI integration and six roles.
It adds global check-in/out, `/timesheet`, `/leaderboard`, and manager-only
`/attendance`. The existing `/team` performance page is preserved. Aggregate
analytics is limited to management, as requested in the attendance brief.

Supabase is used as PostgreSQL. Auth.js accounts, password hashes, sessions and
AUTH_SECRET must be retained. Attendance is accessed only by authenticated server
code; its Data API surface is blocked by RLS. TLS remains verified using the
provider root certificate through DATABASE_CA_CERT. The old encrypted-but-unverified
TLS fallback is deliberately not restored.

## Live cutover checklist

1. Connect the Supabase plugin to the original project. Installation is confirmed,
   but no Supabase project/SQL tools were exposed in this conversation.
2. Inspect the database, migration journal, account and lead counts, and backups.
   Determine whether repair is sufficient before creating a replacement database.
3. Confirm Vercel Production DATABASE_URL points to the correct pooler and
   DIRECT_URL points to a direct/session connection suitable for migrations.
   Preserve AUTH_SECRET. Store credentials in environment variables only.
4. Configure the provider's trusted root PEM certificate as DATABASE_CA_CERT.
5. Compare migration history, then run npm run db:migrate. Existing migrations
   0000–0003 are unchanged. The attendance migration was created with the Supabase
   CLI and moved into Drizzle's existing directory/journal to keep one runner.
6. Run Supabase advisors, verify RLS and confirm data counts remain unchanged.
7. Deploy and test login, all CRM routes, check-in/out, permission isolation,
   imports/exports and error logs.

Preview builds no longer run database migrations automatically. Migration is a
separate deployment step to avoid changing production through a preview branch.

No live database operations or production deployment have occurred. The connected
Vercel tools do not expose secret environment values. Manager corrections,
automatic shift closure and payroll are outside this implementation.

## Validation

The recovery code is tested against isolated PGlite PostgreSQL via node-postgres.
Live AI tests are opt-in and skipped without an API key. Production verification
and Supabase advisors remain blocked on the missing database connection tools.

77 automated tests passed (4 optional live-AI tests skipped), including concurrent
attendance, stale check-out, ownership, timezone handling, expanded role permissions,
TLS and a PostgreSQL RLS denial check. Migrations applied and reapplied. The production
build and typecheck passed. Authenticated HTTP assertions passed for all 16 CRM pages
and six-role attendance access. Browser visual verification and live Supabase testing
remain outstanding.
