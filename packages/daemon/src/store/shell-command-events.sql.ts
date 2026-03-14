import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const shellCommandEventsTable = sqliteTable(
	"shell_command_events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		command: text("command").notNull(),
		exit_code: integer("exit_code"),
		duration_ms: integer("duration_ms"),
	},
	(table) => [
		uniqueIndex("idx_shell_command_events_event_id").on(table.event_id),
		index("idx_shell_command_events_exit_code").on(table.exit_code),
	],
);
