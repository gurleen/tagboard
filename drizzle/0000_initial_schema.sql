CREATE TABLE `board` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`layout` text DEFAULT 'grid' NOT NULL,
	`column_count` integer DEFAULT 3 NOT NULL,
	`row_count` integer DEFAULT 2 NOT NULL,
	`rotation_interval_ms` integer DEFAULT 8000 NOT NULL,
	`transition` text DEFAULT 'fade' NOT NULL,
	`transition_duration_ms` integer DEFAULT 600 NOT NULL,
	`show_metrics` integer DEFAULT false NOT NULL,
	`show_timestamp` integer DEFAULT true NOT NULL,
	`show_platform_badge` integer DEFAULT true NOT NULL,
	`theme` text NOT NULL,
	`is_live` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `board_is_live_index` ON `board` (`is_live`);--> statement-breakpoint
CREATE TABLE `board_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`post_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`last_aired_at` integer,
	`air_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `board_entry_order_index` ON `board_entry` (`board_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `board_entry_membership` ON `board_entry` (`board_id`,`post_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`role` text DEFAULT 'attachment' NOT NULL,
	`kind` text DEFAULT 'image' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`source_url` text NOT NULL,
	`cached_path` text,
	`cache_state` text DEFAULT 'pending' NOT NULL,
	`cache_error` text,
	`byte_length` integer,
	`content_type` text,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_post_index` ON `media` (`post_id`,`role`,`position`);--> statement-breakpoint
CREATE INDEX `media_cache_state_index` ON `media` (`cache_state`);--> statement-breakpoint
CREATE TABLE `post` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`origin` text NOT NULL,
	`platform_post_id` text,
	`permalink` text,
	`author_name` text NOT NULL,
	`author_handle` text,
	`author_profile_url` text,
	`author_verified` integer DEFAULT false NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`language` text,
	`posted_at` integer,
	`like_count` integer,
	`repost_count` integer,
	`reply_count` integer,
	`resolution_state` text DEFAULT 'pending' NOT NULL,
	`resolution_error` text,
	`raw_payload` text,
	`review_state` text DEFAULT 'pending' NOT NULL,
	`reviewed_at` integer,
	`review_note` text,
	`starred` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `post_review_state_index` ON `post` (`review_state`,`created_at`);--> statement-breakpoint
CREATE INDEX `post_platform_index` ON `post` (`platform`);--> statement-breakpoint
CREATE INDEX `post_resolution_state_index` ON `post` (`resolution_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_platform_identity` ON `post` (`platform`,`platform_post_id`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
