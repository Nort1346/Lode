ALTER TABLE `downloads` ADD `organized_path` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `organize_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `downloads` ADD `organize_error` text;