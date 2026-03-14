import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { unixEpochNow } from "./schema.sql";

export const chatSessionsTable = sqliteTable(
	"chat_sessions",
	{
		session_id: text("session_id").primaryKey(),
		created_at: integer("created_at").notNull().default(unixEpochNow),
		updated_at: integer("updated_at").notNull().default(unixEpochNow),
		repo_id: text("repo_id"),
		worktree_root: text("worktree_root"),
		cwd: text("cwd"),
		branch: text("branch"),
		title: text("title"),
		last_user_message_preview: text("last_user_message_preview"),
	},
	(table) => [
		index("idx_chat_sessions_updated_at").on(table.updated_at),
		index("idx_chat_sessions_repo_id").on(table.repo_id),
		index("idx_chat_sessions_worktree_root").on(table.worktree_root),
		index("idx_chat_sessions_cwd").on(table.cwd),
	],
);
