ALTER TABLE "videos" ALTER COLUMN "embed_fit" SET DEFAULT 'contain';--> statement-breakpoint
UPDATE "videos" SET "embed_fit" = 'contain' WHERE "embed_url" IS NOT NULL AND "embed_fit" = 'cover';
