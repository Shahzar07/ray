-- Deny the PostgREST surface.
--
-- Supabase exposes every table in `public` through PostgREST to the `anon`
-- key, and that key ships in browser bundles. CallDesk never uses PostgREST or
-- the Supabase client SDK — it talks to Postgres directly through Drizzle — so
-- without this, anyone holding the anon key could read and write leads and
-- users straight past the permission layer.
--
-- RLS enabled with NO policies denies anon and authenticated everything. The
-- app is unaffected because it connects as `postgres`, which owns these tables
-- and has BYPASSRLS. This is a no-op on Neon or plain Postgres, where no such
-- REST surface exists.
--
-- If the Supabase client SDK is ever adopted, add explicit policies — do not
-- turn this off.
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_field_defs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "do_not_call" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lead_visibility_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;
