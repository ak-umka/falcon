CREATE TABLE `ai_connections` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `script_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`request_key` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`document` text NOT NULL,
	`result` text,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `script_request` ON `script_jobs` (`owner_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_script` ON `script_jobs` (`owner_id`) WHERE "script_jobs"."status"='generating';