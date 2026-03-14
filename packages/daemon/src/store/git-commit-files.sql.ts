import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const gitCommitFilesTable = sqliteTable(
	"git_commit_files",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		id: text("id").notNull().unique(),
		event_id: text("event_id")
			.notNull()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
	},
	(table) => [
		uniqueIndex("idx_git_commit_files_id").on(table.id),
		index("idx_git_commit_files_event_id").on(table.event_id),
		index("idx_git_commit_files_path").on(table.path),
	],
);
