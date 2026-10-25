CREATE TABLE IF NOT EXISTS "promos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'affiliate' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"image_url" text,
	"cta_text" text DEFAULT '詳しく見る' NOT NULL,
	"target_url" text,
	"html" text,
	"label" text DEFAULT 'PR' NOT NULL,
	"category" text DEFAULT 'all' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promos_active_idx" ON "promos" USING btree ("active","category");
