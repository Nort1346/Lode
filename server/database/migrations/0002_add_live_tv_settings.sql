ALTER TABLE `sync_user_settings` ADD `enable_live_tv_access` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_user_settings` ADD `enable_live_tv_management` integer DEFAULT 0 NOT NULL;
