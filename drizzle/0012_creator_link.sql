ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "destination_id" uuid;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "affiliate_url" text;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
