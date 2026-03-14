import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const gitCommitEventsTable = sqliteTable(
	"git_commit_events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		hash: text("hash").notNull(),
		message: text("message").notNull(),
		files_changed: integer("files_changed").notNull().default(0),
		insertions: integer("insertions"),
		deletions: integer("deletions"),
	},
	(table) => [
		uniqueIndex("idx_git_commit_events_event_id").on(table.event_id),
		index("idx_git_commit_events_hash").on(table.hash),
	],
);
