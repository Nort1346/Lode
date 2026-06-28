CREATE TABLE IF NOT EXISTS `sync_user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_name` text NOT NULL,
	`library_access` text DEFAULT 'all' NOT NULL,
	`enable_video_transcoding` integer DEFAULT true NOT NULL,
	`enable_audio_transcoding` integer DEFAULT true NOT NULL,
	`enable_remuxing` integer DEFAULT true NOT NULL,
	`max_active_sessions` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sync_user_settings_user` ON `sync_user_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sync_user_settings_user_provider` ON `sync_user_settings` (`user_id`,`provider_name`);
