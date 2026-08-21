CREATE INDEX "idx_downloads_user_status" ON "downloads" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_downloads_status" ON "downloads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_downloads_user_created" ON "downloads" USING btree ("user_id","created_at");