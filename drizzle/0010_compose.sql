ALTER TABLE "uploads" ADD COLUMN "cover_time_ms" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "cover_time_ms" integer;