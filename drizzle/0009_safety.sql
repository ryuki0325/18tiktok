CREATE TABLE "creator_verifications" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"method" text DEFAULT 'self_declared' NOT NULL,
	"status" text DEFAULT 'none' NOT NULL,
	"birth_date" text,
	"is_adult" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"rejected_reason" text,
	"expires_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_name" text NOT NULL,
	"domain" text NOT NULL,
	"affiliate_url" text DEFAULT '' NOT NULL,
	"url_pattern" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"owner_id" uuid,
	"priority" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"report_id" uuid,
	"report_count" integer DEFAULT 0 NOT NULL,
	"assigned_to" uuid,
	"due_at" timestamp with time zone,
	"summary" text DEFAULT '' NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"owner_id" uuid,
	"reason" text NOT NULL,
	"description" text,
	"reporter_key" text NOT NULL,
	"reporter_id" uuid,
	"priority" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"auto_actioned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_sanctions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"ends_at" timestamp with time zone,
	"admin_id" uuid NOT NULL,
	"case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text NOT NULL,
	"row_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link_clicks" ADD COLUMN "click_id" text;--> statement-breakpoint
ALTER TABLE "link_clicks" ADD COLUMN "creator_id" uuid;--> statement-breakpoint
ALTER TABLE "link_clicks" ADD COLUMN "destination_id" uuid;--> statement-breakpoint
ALTER TABLE "outbound_links" ADD COLUMN "destination_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "post_banned_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "comment_banned_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creator_verifications" ADD CONSTRAINT "creator_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "destinations_domain_uq" ON "destinations" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_open_target" ON "moderation_cases" USING btree ("target_type","target_id","kind");--> statement-breakpoint
CREATE INDEX "cases_queue_idx" ON "moderation_cases" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_once" ON "reports" USING btree ("target_type","target_id","reporter_key");--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "sanctions_user_idx" ON "user_sanctions" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "outbound_links" ADD CONSTRAINT "outbound_links_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "link_clicks_click_uq" ON "link_clicks" USING btree ("click_id");--> statement-breakpoint
CREATE INDEX "link_clicks_dest_idx" ON "link_clicks" USING btree ("destination_id","created_at");--> statement-breakpoint
CREATE INDEX "link_clicks_creator_idx" ON "link_clicks" USING btree ("creator_id","created_at");--> statement-breakpoint
-- ===== ここから、既存データの引っ越し =====

-- 1) 既存のクリック記録に照合用の番号を振ってから NOT NULL にする
UPDATE link_clicks SET click_id = replace(gen_random_uuid()::text, '-', '') WHERE click_id IS NULL;
--> statement-breakpoint
ALTER TABLE "link_clicks" ALTER COLUMN "click_id" SET NOT NULL;
--> statement-breakpoint
UPDATE link_clicks lc SET creator_id = v.creator_id FROM videos v WHERE v.id = lc.video_id AND lc.creator_id IS NULL;
--> statement-breakpoint

-- 2) 動画の状態をあたらしい呼び方にそろえる
UPDATE videos SET status = 'hidden', hidden_reason = 'by_report' WHERE status = 'hidden_by_report';
--> statement-breakpoint
UPDATE videos SET status = 'hidden', hidden_reason = 'by_creator' WHERE status = 'hidden_by_creator';
--> statement-breakpoint
UPDATE videos SET status = 'deleted', deleted_at = coalesce(deleted_at, created_at) WHERE status = 'removed';
--> statement-breakpoint
UPDATE videos SET approved_at = published_at WHERE status = 'published' AND approved_at IS NULL;
--> statement-breakpoint

-- 3) 送客先を、いまの許可ドメインから作る（承認済みとして引き継ぐ）
INSERT INTO destinations (service_name, domain, status, approved_at, note)
SELECT display_name, domain, CASE WHEN is_active THEN 'approved' ELSE 'paused' END, now(), '許可ドメインから引き継ぎ'
FROM affiliate_domains
ON CONFLICT (domain) DO NOTHING;
--> statement-breakpoint
UPDATE outbound_links ol SET destination_id = d.id FROM destinations d WHERE d.domain = ol.domain AND ol.destination_id IS NULL;
--> statement-breakpoint

-- 4) 動画の通報を、あたらしい通報テーブルへ移す
INSERT INTO reports (id, target_type, target_id, owner_id, reason, description, reporter_key, priority, status, sla_due_at, auto_actioned, created_at, updated_at, resolved_at)
SELECT rt.id, 'video', rt.video_id, v.creator_id,
  CASE rt.reason WHEN 'non_consensual' THEN 'no_consent' WHEN 'inappropriate' THEN 'other' ELSE rt.reason END,
  rt.detail, rt.reporter_key,
  CASE rt.priority WHEN 'P0' THEN 'critical' WHEN 'P1' THEN 'high' ELSE 'low' END,
  CASE rt.status WHEN 'open' THEN 'open' WHEN 'resolved_restored' THEN 'resolved_restored'
       WHEN 'resolved_removed' THEN 'resolved_removed' ELSE 'dismissed' END,
  rt.sla_due_at, rt.auto_hidden, rt.created_at, rt.created_at,
  CASE WHEN rt.status = 'open' THEN NULL ELSE rt.created_at END
FROM report_tickets rt JOIN videos v ON v.id = rt.video_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 5) コメントの通報も同じテーブルへ
INSERT INTO reports (target_type, target_id, owner_id, reason, reporter_key, priority, status, sla_due_at, created_at, updated_at)
SELECT 'comment', cr.comment_id, c.user_id,
  CASE cr.reason WHEN 'minor_related' THEN 'minor_suspected' WHEN 'harassment' THEN 'harassment' WHEN 'spam' THEN 'spam' ELSE 'other' END,
  cr.reporter_key, 'low', 'open', cr.created_at + interval '7 days', cr.created_at, cr.created_at
FROM comment_reports cr JOIN comments c ON c.id = cr.comment_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 6) 未対応の通報と審査待ちの動画を、運営の作業キューに積む
INSERT INTO moderation_cases (kind, target_type, target_id, owner_id, priority, status, report_id, report_count, due_at, summary, created_at, updated_at)
SELECT 'report', r.target_type, r.target_id, r.owner_id, min(r.priority), 'open', min(r.id::text)::uuid, count(*),
  min(r.sla_due_at), '通報あり', min(r.created_at), now()
FROM reports r WHERE r.status in ('open','in_progress')
GROUP BY r.target_type, r.target_id, r.owner_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO moderation_cases (kind, target_type, target_id, owner_id, priority, status, summary, created_at, updated_at)
SELECT 'video_review', 'video', v.id, v.creator_id, 'medium', 'open', '審査待ち：' || v.title, v.created_at, now()
FROM videos v WHERE v.status = 'pending_review'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 7) 停止中の投稿者を、あたらしい利用者の状態にも反映する
UPDATE users u SET status = 'suspended' FROM creator_profiles cp WHERE cp.user_id = u.id AND cp.status = 'suspended' AND u.status = 'active';
--> statement-breakpoint
UPDATE users u SET status = 'banned' FROM creator_profiles cp WHERE cp.user_id = u.id AND cp.status = 'banned' AND u.status = 'active';
--> statement-breakpoint

-- 8) 措置の記録は書き換えできないようにする（既存の4テーブルと同じ守り）
CREATE TRIGGER user_sanctions_append_only BEFORE UPDATE OR DELETE ON user_sanctions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
