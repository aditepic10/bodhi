import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const eventContextsTable = sqliteTable(
	"event_contexts",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		repo_id: text("repo_id"),
		worktree_root: text("worktree_root"),
		branch: text("branch"),
		head_sha: text("head_sha"),
		git_state: text("git_state"),
		cwd: text("cwd"),
		relative_cwd: text("relative_cwd"),
		terminal_session: text("terminal_session"),
		tool: text("tool"),
		thread_id: text("thread_id"),
	},
	(table) => [
		uniqueIndex("idx_event_contexts_event_id").on(table.event_id),
		index("idx_event_contexts_repo_id").on(table.repo_id),
		index("idx_event_contexts_branch").on(table.branch),
		index("idx_event_contexts_repo_branch").on(table.repo_id, table.branch),
		index("idx_event_contexts_tool").on(table.tool),
		index("idx_event_contexts_thread_id").on(table.thread_id),
		index("idx_event_contexts_cwd").on(table.cwd),
	],
);
