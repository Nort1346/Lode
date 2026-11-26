ALTER TABLE `downloads` ADD `prep_started_at` text;--> statement-breakpoint
UPDATE `downloads` SET `prep_started_at` = `completed_at` WHERE `status` = 'completed' AND `prep_started_at` IS NULL;--> statement-breakpoint
INSERT INTO `settings` (`key`, `value`)
SELECT 'prep_delay_seconds', CAST(CAST(ROUND(MIN(300, MAX(0, 1024.0 / CAST(`value` AS REAL)))) AS INTEGER) AS TEXT)
FROM `settings`
WHERE `key` = 'prep_speed_mb' AND CAST(`value` AS REAL) > 0
ON CONFLICT (`key`) DO NOTHING;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'prep_speed_mb';
