ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "images" jsonb;
