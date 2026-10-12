ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "embed_url" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "embed_domain" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embed_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "domain" text NOT NULL,
  "display_name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "embed_sources_uq" ON "embed_sources" ("domain");
