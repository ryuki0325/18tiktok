CREATE TABLE "comment_likes" (
	"viewer_key" text NOT NULL,
	"comment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_viewer_key_comment_id_pk" PRIMARY KEY("viewer_key","comment_id")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
-- コメントのいいね数をトリガーで増減
CREATE OR REPLACE FUNCTION comments_like_counter() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER comment_likes_counter AFTER INSERT OR DELETE ON comment_likes FOR EACH ROW EXECUTE FUNCTION comments_like_counter();
--> statement-breakpoint
-- 返信は同じ動画のコメントにだけ付けられる
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE cascade;
--> statement-breakpoint
-- 投稿者申請に書いた自己紹介を、プロフィールの初期値として引き継ぐ
UPDATE users SET bio = cp.bio FROM creator_profiles cp WHERE cp.user_id = users.id AND cp.bio <> '' AND users.bio = '';
