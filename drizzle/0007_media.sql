CREATE TABLE "not_interested" (
	"viewer_key" text NOT NULL,
	"video_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "not_interested_viewer_key_video_id_pk" PRIMARY KEY("viewer_key","video_id")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
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
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "playback_url" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "media_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "not_interested" ADD CONSTRAINT "not_interested_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploads_user_idx" ON "uploads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_video_idx" ON "uploads" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "videos_creator_idx" ON "videos" USING btree ("creator_id","published_at");--> statement-breakpoint
-- いいね数・再生数をトリガーで増減（どの経路で追加・削除されても正しい数を保つ）
CREATE OR REPLACE FUNCTION videos_like_counter() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE videos SET like_count = like_count + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE videos SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER likes_counter AFTER INSERT OR DELETE ON likes FOR EACH ROW EXECUTE FUNCTION videos_like_counter();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION videos_view_counter() RETURNS trigger AS $$
BEGIN
  IF NEW.is_valid THEN
    UPDATE videos SET view_count = view_count + 1 WHERE id = NEW.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER views_counter AFTER INSERT ON views FOR EACH ROW EXECUTE FUNCTION videos_view_counter();
--> statement-breakpoint
UPDATE videos SET
  like_count = (SELECT count(*) FROM likes l WHERE l.video_id = videos.id),
  view_count = (SELECT count(*) FROM views w WHERE w.video_id = videos.id AND w.is_valid);
