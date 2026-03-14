CREATE TABLE `git_rewrite_mappings` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`event_id` text NOT NULL,
	`old_commit_sha` text NOT NULL,
	`new_commit_sha` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_rewrite_mappings_id_unique` ON `git_rewrite_mappings` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_git_rewrite_mappings_id` ON `git_rewrite_mappings` (`id`);--> statement-breakpoint
CREATE INDEX `idx_git_rewrite_mappings_event_id` ON `git_rewrite_mappings` (`event_id`);--> statement-breakpoint
ALTER TABLE `git_checkout_events` ADD `checkout_kind` text NOT NULL;--> statement-breakpoint
ALTER TABLE `git_checkout_events` DROP COLUMN `is_file_checkout`;--> statement-breakpoint
ALTER TABLE `git_commit_events` ADD `parent_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `git_merge_events` ADD `merge_commit_sha` text NOT NULL;--> statement-breakpoint
ALTER TABLE `git_merge_events` ADD `parent_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `git_merge_events` DROP COLUMN `merged_branch`;--> statement-breakpoint
ALTER TABLE `git_rewrite_events` ADD `rewritten_commit_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `git_rewrite_events` DROP COLUMN `rewritten_commits`;