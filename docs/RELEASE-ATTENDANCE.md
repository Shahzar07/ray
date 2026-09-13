# Raynaters CRM — attendance and reliability update

## Follow-up: supplied Neon connection verified

A user-supplied pooled Neon connection was tested read-only on 13 September 2026.
The HTTPS Neon driver connected successfully to `neondb`, with no custom CA needed.
The database has no `public.users`, `public.leads`, or `public.work_sessions` tables.
Do not change production to this URL without explicitly deciding how to preserve or
migrate the existing CRM data. No credentials are stored in this repository.

Vercel production is still pinned to commit `396e6bc` on
`claude/modern-dashboard-ui-srz84s`. Another branch,
`claude/modern-dashboard-ui-okdhej` at `5141f3e`, documents the original Supabase
connection and a previous fix for this exact TLS failure. It also contains additional
CRM features. Those features must be considered before changing the production branch.

The connected Vercel tools available in this session do not expose the production
`DATABASE_URL` value. Confirm its hostname in Vercel before applying a provider-specific
fix. The certificate instructions below are conditional on the actual deployed database
using a private CA; they are not a requirement for the tested Neon endpoint.

## Confirmed production failure

Vercel runtime logs for `raynaters-dashboard` show `SELF_SIGNED_CERT_IN_CHAIN`
while `hasAnyUser()` queries Postgres. The `/` error digest is `1839686528`, matching
the reported screenshot. `/login` and `/today` fail for the same reason.

The node-postgres connection now accepts `DATABASE_CA_CERT`, including PEM values
with literal `\n` separators. This config is shared by the app, migration and seed
scripts. Conflicting URL SSL options are removed only when a CA is supplied;
certificate and hostname verification remain enabled. Existing connections without
custom CAs retain their connection-string settings.

**The code alone cannot repair the deployed connection.** Obtain the trusted root CA
from the database provider's dashboard and set `DATABASE_CA_CERT` in Vercel for the
relevant environment. Never use the leaf certificate from an untrusted connection,
`NODE_TLS_REJECT_UNAUTHORIZED=0`, or blanket `rejectUnauthorized: false`.

## Deployment

1. Set the provider CA in `DATABASE_CA_CERT` alongside the existing `DATABASE_URL`
   and `AUTH_SECRET`. Keep database credentials out of source control.
2. Run `npm run db:migrate` against the intended database with the same CA environment.
   Migration 0001 adds only `work_sessions`, its indexes and interval constraint.
   Do not run the seed script against production: it removes sample target data.
3. Deploy this branch after reviewing the changes.
4. Verify `/login`, sign in, check in and out, and inspect `/team` as an owner.
   Confirm the production logs no longer contain the certificate-chain error.

## Included

- Raynaters-branded dashboard hero, clearer sidebar and team presence interface.
- Global check-in/out, including Call Mode and mobile; timestamps originate in Postgres.
- Multiple sessions per day, one open session per user enforced in Postgres.
- Idempotent repeated check-in and session-specific check-out. A delayed check-out
  cannot close a newer shift. Tabs synchronize using BroadcastChannel and focus refresh.
- Employee daily timesheets with timezone labels, overnight-date grouping and empty days.
- Manager-only team presence, month/team filters, working-hours totals, expandable
  shifts and CSV export. Owners can select teams in their organization.
- Live manager refresh every 30 seconds; long open shifts show a review message.
- Attendance outages do not prevent using the CRM.
- Leaderboard route with no attendance data. Analytics navigation restricted to managers.
- Friendly retry screens for route failures.
- Fixed cross-organization owner lead access and direct Call Mode lead access bypass.
- Leaderboard aggregation now explicitly filters the selected team.

## Scope remaining from the older design document

This release implements the requested check-in/out and admin hour tracking. The older
ATTENDANCE.md includes further features that are not part of this release:
manager corrections and audit history, undo, correction requests, automatic closure,
attendance pre-aggregation, hours-vs-output analytics, and attendance seed fixtures.
Open shifts are flagged after 12 hours; they are not automatically shortened based on
sales activity. Managers should follow up on those records before using totals.

The pre-existing unfinished `/analytics`, `/board`, `/trials`, `/import`, and `/settings`
screens remain outside this update. Their original navigation links remain present.

## Verification

33 Vitest tests passed against isolated PGlite PostgreSQL through node-postgres.
Coverage includes concurrent check-in, stale check-out, ownership of sessions, persisted
records, linked-agent manager denial, cross-org lead access, TLS configuration, local
midnight, DST and month validation. Migrations were applied twice successfully.
Production Next.js build and TypeScript checks passed. The isolated database does not
verify the production provider's TLS chain; that requires the configured provider CA.

Authenticated HTTP smoke tests passed for `/today`, `/team`, `/timesheet`,
`/leaderboard`, `/leads`, and `/call`. Direct `/team` requests by an agent redirect
to `/today`, and anonymous requests redirect to login. Browser visual verification
could not complete because the local browser runtime failed to start in this environment.
