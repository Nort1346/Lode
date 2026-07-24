CREATE TABLE "activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"username" text,
	"action" text NOT NULL,
	"details" text,
	"ip" text,
	"user_agent" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_trackers" (
	"id" text PRIMARY KEY NOT NULL,
	"indexer_name" text NOT NULL,
	"tracker_type" text DEFAULT 'counting' NOT NULL,
	"cookie" text DEFAULT '' NOT NULL,
	"login_url" text,
	"login_username" text,
	"login_password" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"torrent_name" text DEFAULT '' NOT NULL,
	"magnet_link" text NOT NULL,
	"save_path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"torrent_hash" text,
	"progress" real DEFAULT 0 NOT NULL,
	"eta_seconds" integer DEFAULT 0 NOT NULL,
	"download_speed" integer DEFAULT 0 NOT NULL,
	"upload_speed" integer DEFAULT 0 NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"downloaded_bytes" integer DEFAULT 0 NOT NULL,
	"num_seeds" integer DEFAULT 0 NOT NULL,
	"num_leechs" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT '' NOT NULL,
	"completed_at" text,
	"tmdb_id" integer,
	"media_type" text,
	"poster_url" text,
	"is_private" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"username" text,
	"success" boolean DEFAULT false NOT NULL,
	"user_agent" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"data" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" text NOT NULL,
	"last_used_at" text
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"media_type" text NOT NULL,
	"media_id" integer NOT NULL,
	"media_title" text NOT NULL,
	"media_poster" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_note" text,
	"admin_note" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"device_name" text,
	"created_at" text NOT NULL,
	"last_active_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_name" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"last_sync_error" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_name" text NOT NULL,
	"library_access" text DEFAULT 'all' NOT NULL,
	"enable_video_transcoding" boolean DEFAULT true NOT NULL,
	"enable_audio_transcoding" boolean DEFAULT true NOT NULL,
	"enable_remuxing" boolean DEFAULT true NOT NULL,
	"enable_live_tv_access" boolean DEFAULT true NOT NULL,
	"enable_live_tv_management" boolean DEFAULT false NOT NULL,
	"max_active_sessions" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_download_limit" integer DEFAULT 5 NOT NULL,
	"active_torrent_limit" integer DEFAULT 3 NOT NULL,
	"max_torrent_size_gb" integer DEFAULT 20 NOT NULL,
	"private_tracker_limit" integer DEFAULT 5 NOT NULL,
	"downloads_today" integer DEFAULT 0 NOT NULL,
	"downloads_reset_at" text,
	"created_at" text DEFAULT '' NOT NULL,
	"discord_id" text,
	"can_submit" boolean DEFAULT false NOT NULL,
	"max_sessions" integer DEFAULT 0 NOT NULL,
	"avatar_url" text,
	"expires_at" text,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"media_type" text NOT NULL,
	"media_id" integer NOT NULL,
	"media_title" text NOT NULL,
	"media_poster" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_custom_trackers_indexer" ON "custom_trackers" USING btree ("indexer_name");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_username" ON "login_attempts" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_created" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sync_providers_user" ON "sync_providers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sync_providers_user_provider" ON "sync_providers" USING btree ("user_id","provider_name");--> statement-breakpoint
CREATE INDEX "idx_sync_user_settings_user" ON "sync_user_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sync_user_settings_user_provider" ON "sync_user_settings" USING btree ("user_id","provider_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_wishlist_user_media" ON "wishlist" USING btree ("user_id","media_type","media_id");