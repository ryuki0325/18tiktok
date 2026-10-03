-- 追記専用テーブル：UPDATE / DELETE をDBレベルで禁止する（同意記録・監査ログ・通報対応履歴・制裁履歴）
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: % cannot be modified', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER video_consents_append_only BEFORE UPDATE OR DELETE ON video_consents FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER report_actions_append_only BEFORE UPDATE OR DELETE ON report_actions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER admin_audit_logs_append_only BEFORE UPDATE OR DELETE ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER creator_penalties_append_only BEFORE UPDATE OR DELETE ON creator_penalties FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
