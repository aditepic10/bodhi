ALTER TABLE `conversations` ADD `status` text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `content_json` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`content` text NOT NULL,
	`content_json` text,
	`session_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`session_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversations_role_valid" CHECK(role in ('user', 'assistant', 'system', 'tool')),
	CONSTRAINT "conversations_status_valid" CHECK(status in ('complete', 'streaming', 'error', 'interrupted'))
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("_rowid", "id", "role", "status", "content", "content_json", "session_id", "created_at") SELECT "_rowid", "id", "role", "status", "content", "content_json", "session_id", "created_at" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_id_unique` ON `conversations` (`id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_session` ON `conversations` (`session_id`);
