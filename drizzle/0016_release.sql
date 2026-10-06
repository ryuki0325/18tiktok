ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "release_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "videos" SET "category" = 'women' WHERE "category" = 'couple';
