ALTER TABLE "user_preferences" ADD COLUMN "audience" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "category" text DEFAULT 'women' NOT NULL;--> statement-breakpoint
CREATE INDEX "videos_category_idx" ON "videos" USING btree ("category","status");