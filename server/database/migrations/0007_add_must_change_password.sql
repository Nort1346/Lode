ALTER TABLE `users` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `users` SET `must_change_password` = 1 WHERE `username` = 'admin';
