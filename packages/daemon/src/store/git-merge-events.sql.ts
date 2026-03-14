import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const gitMergeEventsTable = sqliteTable(
	"git_merge_events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		merge_commit_sha: text("merge_commit_sha").notNull(),
		parent_count: integer("parent_count").notNull().default(0),
		is_squash: integer("is_squash", { mode: "boolean" }).notNull().default(false),
	},
	(table) => [uniqueIndex("idx_git_merge_events_event_id").on(table.event_id)],
);
