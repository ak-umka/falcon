CREATE TABLE `backgrounds` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`request_key` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`avatar_id` text,
	`photo_id` text,
	`status` text NOT NULL,
	`provider_id` text,
	`document` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backgrounds_owner` ON `backgrounds` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `background_request` ON `backgrounds` (`owner_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_background` ON `backgrounds` (`owner_id`) WHERE "backgrounds"."status" IN ('preparing','submitting','processing','unconfirmed');