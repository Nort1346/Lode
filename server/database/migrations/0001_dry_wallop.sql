ALTER TABLE `users` ADD `max_sessions` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`device_name` text,
	`created_at` text NOT NULL,
	`last_active_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_user` ON `sessions` (`user_id`);
