CREATE INDEX `idx_downloads_user_status` ON `downloads` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_downloads_status` ON `downloads` (`status`);--> statement-breakpoint
CREATE INDEX `idx_downloads_user_created` ON `downloads` (`user_id`,`created_at`);