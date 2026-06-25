CREATE TABLE IF NOT EXISTS `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`username` text,
	`action` text NOT NULL,
	`details` text,
	`ip` text,
	`user_agent` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `custom_trackers` (
	`id` text PRIMARY KEY NOT NULL,
	`indexer_name` text NOT NULL,
	`tracker_type` text DEFAULT 'counting' NOT NULL,
	`cookie` text DEFAULT '' NOT NULL,
	`login_url` text,
	`login_username` text,
	`login_password` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_custom_trackers_indexer` ON `custom_trackers` (`indexer_name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`torrent_name` text DEFAULT '' NOT NULL,
	`magnet_link` text NOT NULL,
	`save_path` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`torrent_hash` text,
	`progress` real DEFAULT 0 NOT NULL,
	`eta_seconds` integer DEFAULT 0 NOT NULL,
	`download_speed` integer DEFAULT 0 NOT NULL,
	`upload_speed` integer DEFAULT 0 NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`downloaded_bytes` integer DEFAULT 0 NOT NULL,
	`num_seeds` integer DEFAULT 0 NOT NULL,
	`num_leechs` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`completed_at` text,
	`tmdb_id` integer,
	`media_type` text,
	`poster_url` text,
	`is_private` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`username` text,
	`success` integer DEFAULT false NOT NULL,
	`user_agent` text,
	`created_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_login_attempts_ip` ON `login_attempts` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_login_attempts_username` ON `login_attempts` (`username`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_login_attempts_created` ON `login_attempts` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`media_title` text NOT NULL,
	`media_poster` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`user_note` text,
	`admin_note` text,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`daily_download_limit` integer DEFAULT 5 NOT NULL,
	`active_torrent_limit` integer DEFAULT 3 NOT NULL,
	`max_torrent_size_gb` integer DEFAULT 20 NOT NULL,
	`private_tracker_limit` integer DEFAULT 5 NOT NULL,
	`downloads_today` integer DEFAULT 0 NOT NULL,
	`downloads_reset_at` text,
	`created_at` text DEFAULT '' NOT NULL,
	`discord_id` text,
	`can_submit` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wishlist` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`media_title` text NOT NULL,
	`media_poster` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_wishlist_user_media` ON `wishlist` (`user_id`,`media_type`,`media_id`);
