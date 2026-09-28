ALTER TABLE "downloads" ADD COLUMN IF NOT EXISTS "indexer_name" text;--> statement-breakpoint
ALTER TABLE "downloads" ADD COLUMN IF NOT EXISTS "resolution" text;--> statement-breakpoint
ALTER TABLE "downloads" ADD COLUMN IF NOT EXISTS "qbit_tag" text;
