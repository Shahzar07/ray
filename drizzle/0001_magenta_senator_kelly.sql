ALTER TABLE "organizations" ADD COLUMN "cadence_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cadence_max_attempts" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cadence_window_days" integer DEFAULT 14 NOT NULL;