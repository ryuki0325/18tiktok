ALTER TABLE "uploads" ADD COLUMN IF NOT EXISTS "trim_start_ms" integer;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN IF NOT EXISTS "trim_end_ms" integer;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tags_status_idx" ON "tags" ("status");
