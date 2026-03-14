CREATE TABLE `chat_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`repo_id` text,
	`worktree_root` text,
	`cwd` text,
	`branch` text,
	`title` text,
	`last_user_message_preview` text
);
--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_updated_at` ON `chat_sessions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_repo_id` ON `chat_sessions` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_worktree_root` ON `chat_sessions` (`worktree_root`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_cwd` ON `chat_sessions` (`cwd`);--> statement-breakpoint
INSERT INTO `chat_sessions` (`session_id`, `created_at`, `updated_at`)
SELECT `session_id`, min(`created_at`), max(`created_at`)
FROM `conversations`
GROUP BY `session_id`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`session_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("_rowid", "id", "role", "content", "session_id", "created_at") SELECT "_rowid", "id", "role", "content", "session_id", "created_at" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_id_unique` ON `conversations` (`id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_session` ON `conversations` (`session_id`);
