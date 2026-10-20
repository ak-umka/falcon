CREATE TABLE `autopilot_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radar_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`published_at` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_article_url` ON `radar_articles` (`url`);--> statement-breakpoint
CREATE INDEX `radar_article_published` ON `radar_articles` (`published_at`);--> statement-breakpoint
CREATE TABLE `radar_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`story_key` text NOT NULL,
	`language` text NOT NULL,
	`project_id` text,
	`status` text NOT NULL,
	`document` text NOT NULL,
	`media_id` text,
	`result` text,
	`error` text,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_item_story` ON `radar_items` (`owner_id`,`story_key`,`language`);--> statement-breakpoint
CREATE INDEX `radar_item_owner` ON `radar_items` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `radar_item_status` ON `radar_items` (`status`,`lease_until`);