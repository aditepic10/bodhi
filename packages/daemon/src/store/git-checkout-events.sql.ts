import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const gitCheckoutEventsTable = sqliteTable(
	"git_checkout_events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		from_branch: text("from_branch"),
		to_branch: text("to_branch"),
		from_sha: text("from_sha"),
		to_sha: text("to_sha"),
		is_file_checkout: integer("is_file_checkout", { mode: "boolean" }).notNull().default(false),
	},
	(table) => [uniqueIndex("idx_git_checkout_events_event_id").on(table.event_id)],
);
