CREATE TABLE `ai_prompt_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompt_events_event_id_unique` ON `ai_prompt_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_prompt_events_event_id` ON `ai_prompt_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `ai_tool_call_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`target` text,
	`description` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_tool_call_events_event_id_unique` ON `ai_tool_call_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_tool_call_events_event_id` ON `ai_tool_call_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_tool_call_events_tool_name` ON `ai_tool_call_events` (`tool_name`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_id_unique` ON `conversations` (`id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_session` ON `conversations` (`session_id`);--> statement-breakpoint
CREATE TABLE `event_contexts` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`repo_id` text,
	`worktree_root` text,
	`branch` text,
	`head_sha` text,
	`git_state` text,
	`cwd` text,
	`relative_cwd` text,
	`terminal_session` text,
	`tool` text,
	`thread_id` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_contexts_event_id_unique` ON `event_contexts` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_contexts_event_id` ON `event_contexts` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_event_contexts_repo_id` ON `event_contexts` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_event_contexts_branch` ON `event_contexts` (`branch`);--> statement-breakpoint
CREATE INDEX `idx_event_contexts_repo_branch` ON `event_contexts` (`repo_id`,`branch`);--> statement-breakpoint
CREATE INDEX `idx_event_contexts_tool` ON `event_contexts` (`tool`);--> statement-breakpoint
CREATE INDEX `idx_event_contexts_thread_id` ON `event_contexts` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_event_contexts_cwd` ON `event_contexts` (`cwd`);--> statement-breakpoint
CREATE TABLE `events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`session_id` text,
	`machine_id` text,
	`search_text` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`producer_version` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`processed_at` integer,
	`started_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_event_id_unique` ON `events` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_events_type` ON `events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_events_created` ON `events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_events_source` ON `events` (`source`);--> statement-breakpoint
CREATE INDEX `idx_events_type_created` ON `events` (`type`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_event_id` ON `events` (`event_id`);--> statement-breakpoint
CREATE TABLE `fact_links` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`fact_id_from` text NOT NULL,
	`fact_id_to` text NOT NULL,
	`relationship_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`fact_id_from`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fact_id_to`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fact_links_id_unique` ON `fact_links` (`id`);--> statement-breakpoint
CREATE TABLE `facts` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_by` text NOT NULL,
	`source_event_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`supersedes_fact_id` text,
	`extraction_meta` text,
	`valid_from` integer,
	`valid_to` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facts_id_unique` ON `facts` (`id`);--> statement-breakpoint
CREATE INDEX `idx_facts_key` ON `facts` (`key`);--> statement-breakpoint
CREATE INDEX `idx_facts_status` ON `facts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_facts_source_event` ON `facts` (`source_event_id`);--> statement-breakpoint
CREATE INDEX `idx_facts_active` ON `facts` (`key`,`status`,`valid_to`);--> statement-breakpoint
CREATE TABLE `git_checkout_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`from_branch` text,
	`to_branch` text,
	`from_sha` text,
	`to_sha` text,
	`is_file_checkout` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_checkout_events_event_id_unique` ON `git_checkout_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_git_checkout_events_event_id` ON `git_checkout_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `git_commit_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`hash` text NOT NULL,
	`message` text NOT NULL,
	`files_changed` integer DEFAULT 0 NOT NULL,
	`insertions` integer,
	`deletions` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_commit_events_event_id_unique` ON `git_commit_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_git_commit_events_event_id` ON `git_commit_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_git_commit_events_hash` ON `git_commit_events` (`hash`);--> statement-breakpoint
CREATE TABLE `git_commit_files` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`event_id` text NOT NULL,
	`path` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_commit_files_id_unique` ON `git_commit_files` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_git_commit_files_id` ON `git_commit_files` (`id`);--> statement-breakpoint
CREATE INDEX `idx_git_commit_files_event_id` ON `git_commit_files` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_git_commit_files_path` ON `git_commit_files` (`path`);--> statement-breakpoint
CREATE TABLE `git_merge_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`merged_branch` text NOT NULL,
	`is_squash` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_merge_events_event_id_unique` ON `git_merge_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_git_merge_events_event_id` ON `git_merge_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `git_rewrite_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`rewrite_type` text NOT NULL,
	`rewritten_commits` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_rewrite_events_event_id_unique` ON `git_rewrite_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_git_rewrite_events_event_id` ON `git_rewrite_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `note_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_events_event_id_unique` ON `note_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_note_events_event_id` ON `note_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `shell_command_events` (
	`_rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`command` text NOT NULL,
	`exit_code` integer,
	`duration_ms` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shell_command_events_event_id_unique` ON `shell_command_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shell_command_events_event_id` ON `shell_command_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_shell_command_events_exit_code` ON `shell_command_events` (`exit_code`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `events_fts` USING fts5(
	`search_text`,
	content=`events`,
	content_rowid=`_rowid`,
	tokenize="unicode61 tokenchars '-/_.'"
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `facts_fts` USING fts5(
	`key`,
	`value`,
	content=`facts`,
	content_rowid=`_rowid`
);
--> statement-breakpoint
CREATE TRIGGER `events_ai` AFTER INSERT ON `events` BEGIN
	INSERT INTO events_fts(rowid, search_text) VALUES (new._rowid, new.search_text);
END;
--> statement-breakpoint
CREATE TRIGGER `events_au` AFTER UPDATE ON `events` BEGIN
	INSERT INTO events_fts(events_fts, rowid, search_text) VALUES('delete', old._rowid, old.search_text);
	INSERT INTO events_fts(rowid, search_text) VALUES (new._rowid, new.search_text);
END;
--> statement-breakpoint
CREATE TRIGGER `events_ad` AFTER DELETE ON `events` BEGIN
	INSERT INTO events_fts(events_fts, rowid, search_text) VALUES('delete', old._rowid, old.search_text);
END;
--> statement-breakpoint
CREATE TRIGGER `facts_ai` AFTER INSERT ON `facts` BEGIN
	INSERT INTO facts_fts(rowid, key, value) VALUES (new._rowid, new.key, new.value);
END;
--> statement-breakpoint
CREATE TRIGGER `facts_au` AFTER UPDATE ON `facts` BEGIN
	INSERT INTO facts_fts(facts_fts, rowid, key, value) VALUES('delete', old._rowid, old.key, old.value);
	INSERT INTO facts_fts(rowid, key, value) VALUES (new._rowid, new.key, new.value);
END;
--> statement-breakpoint
CREATE TRIGGER `facts_ad` AFTER DELETE ON `facts` BEGIN
	INSERT INTO facts_fts(facts_fts, rowid, key, value) VALUES('delete', old._rowid, old.key, old.value);
END;
