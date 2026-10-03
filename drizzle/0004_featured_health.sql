CREATE TABLE "featured_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbound_links" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbound_links" ADD COLUMN "last_check_status" text;--> statement-breakpoint
ALTER TABLE "outbound_links" ADD COLUMN "check_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "featured_slots" ADD CONSTRAINT "featured_slots_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE cascade ON UPDATE no action;