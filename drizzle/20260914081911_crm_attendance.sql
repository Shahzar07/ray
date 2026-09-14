CREATE TABLE "work_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"local_date" date NOT NULL,
	"duration_seconds" integer,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_sessions_user_date_idx" ON "work_sessions" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "work_sessions_team_date_idx" ON "work_sessions" USING btree ("team_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "work_sessions_one_open_per_user" ON "work_sessions" USING btree ("user_id") WHERE "work_sessions"."ended_at" is null;
--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_valid_interval" CHECK (
  ("ended_at" IS NULL AND "duration_seconds" IS NULL) OR
  ("ended_at" IS NOT NULL AND "duration_seconds" IS NOT NULL AND "ended_at" >= "started_at" AND "duration_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "work_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "work_sessions" FROM PUBLIC;
