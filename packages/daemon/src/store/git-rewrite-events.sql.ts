import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const gitRewriteEventsTable = sqliteTable(
	"git_rewrite_events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		rewrite_type: text("rewrite_type").notNull(),
		rewritten_commits: integer("rewritten_commits").notNull().default(1),
	},
	(table) => [uniqueIndex("idx_git_rewrite_events_event_id").on(table.event_id)],
);
