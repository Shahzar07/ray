-- Three roles beyond the original owner / team_lead / agent.
--
--   manager     org-wide operational control, one step below owner: everything
--               except org administration (minting owners, creating teams,
--               deactivating people).
--   researcher  builds and cleans the lead lists — imports, custom fields and
--               the do-not-call register — but never calls and sees no
--               performance figures.
--   viewer      read-only. A stakeholder who should see the pipeline and never
--               be able to touch it.
--
-- Positioned inside the enum rather than appended so the values read in
-- authority order, which is the order the UI offers them in.
--
-- ALTER TYPE ... ADD VALUE is transaction-safe on PostgreSQL 12+ provided the
-- new value is not *used* in the same transaction. Nothing here uses them, so
-- this is safe inside Drizzle's migration transaction. IF NOT EXISTS keeps it
-- idempotent against a database where it has already been applied by hand.
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'manager' AFTER 'owner';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'researcher' AFTER 'agent';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'viewer' AFTER 'researcher';
