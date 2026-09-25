ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "must_change_password" = true WHERE "username" = 'admin';
