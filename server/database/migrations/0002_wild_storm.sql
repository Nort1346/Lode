CREATE TABLE IF NOT EXISTS `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`link` text,
	`data` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifications_user` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifications_user_read` ON `notifications` (`user_id`, `read`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`);
