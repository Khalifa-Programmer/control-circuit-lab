CREATE TABLE `diagrams` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`doc` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `diagrams_project_idx` ON `diagrams` (`project_id`,`position`);--> statement-breakpoint
CREATE TABLE `gallery_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`author_email` text NOT NULL,
	`source_diagram_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`doc` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gallery_source_idx` ON `gallery_posts` (`author_id`,`source_diagram_id`);--> statement-breakpoint
CREATE TABLE `gallery_votes` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
