ALTER TABLE "user_preferences" ADD COLUMN "max_intensity" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "intensity" integer DEFAULT 1 NOT NULL;