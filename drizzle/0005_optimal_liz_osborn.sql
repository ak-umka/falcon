CREATE TABLE `media_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`metadata` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_connection_owner_provider` ON `media_connections` (`owner_id`,`provider`);--> statement-breakpoint
CREATE TABLE `media_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`request_key` text NOT NULL,
	`provider` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`signature` text NOT NULL,
	`document` text NOT NULL,
	`external_id` text,
	`result` text,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_job_request` ON `media_jobs` (`owner_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `media_job_project` ON `media_jobs` (`owner_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_job_active` ON `media_jobs` (`owner_id`,`project_id`,`scene_id`) WHERE "media_jobs"."status" IN ('preparing','submitting','processing','unconfirmed');