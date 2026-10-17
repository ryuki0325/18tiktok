ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "embed_fit" text DEFAULT 'cover' NOT NULL;
