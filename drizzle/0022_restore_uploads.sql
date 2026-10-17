CREATE TABLE IF NOT EXISTS "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" uuid,
	"provider" text NOT NULL,
	"provider_ref" text,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"received" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"playback_url" text,
	"thumbnail_url" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"cover_time_ms" integer,
	"trim_start_ms" integer,
	"trim_end_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "uploads_user_idx" ON "uploads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "uploads_video_idx" ON "uploads" USING btree ("video_id");
