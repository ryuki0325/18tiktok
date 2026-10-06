CREATE TABLE IF NOT EXISTS "creator_affiliates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "destination_id" uuid NOT NULL,
  "affiliate_id" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "creator_affiliates" ADD CONSTRAINT "creator_affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "creator_affiliates" ADD CONSTRAINT "creator_affiliates_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creator_affiliates_uq" ON "creator_affiliates" ("destination_id","affiliate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_affiliates_user_idx" ON "creator_affiliates" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "creator_attestations" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "text_hash" text NOT NULL,
  "items" jsonb NOT NULL,
  "ip_hash" text NOT NULL,
  "user_agent" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "prev_hash" text NOT NULL,
  "row_hash" text NOT NULL
);--> statement-breakpoint
DROP TRIGGER IF EXISTS creator_attestations_append_only ON creator_attestations;--> statement-breakpoint
CREATE TRIGGER creator_attestations_append_only BEFORE UPDATE OR DELETE ON creator_attestations FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

-- すでに登録されている販売ページのURLは、ドメインから送客先を引いて移しておく
INSERT INTO "creator_affiliates" ("user_id", "destination_id", "affiliate_id")
SELECT cp.user_id, cp.destination_id, cp.affiliate_url
FROM "creator_profiles" cp
WHERE cp.destination_id IS NOT NULL AND cp.affiliate_url IS NOT NULL
ON CONFLICT DO NOTHING;
