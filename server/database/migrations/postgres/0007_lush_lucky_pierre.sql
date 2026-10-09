ALTER TABLE "downloads" ADD COLUMN "organized_path" text;--> statement-breakpoint
ALTER TABLE "downloads" ADD COLUMN "organize_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "downloads" ADD COLUMN "organize_error" text;