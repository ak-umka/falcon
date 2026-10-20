CREATE TABLE `production_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`request_key` text NOT NULL,
	`status` text NOT NULL,
	`document` text NOT NULL,
	`signature` text NOT NULL,
	`result` text,
	`error` text,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_run_request` ON `production_runs` (`owner_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `production_run_active` ON `production_runs` (`owner_id`,`project_id`) WHERE "production_runs"."status" IN ('queued','running','waiting');--> statement-breakpoint
CREATE TABLE `worker_health` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL
);
