import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const aiToolCallEventsTable = sqliteTable(
	"ai_tool_call_events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		tool_name: text("tool_name").notNull(),
		target: text("target"),
		description: text("description"),
	},
	(table) => [
		uniqueIndex("idx_ai_tool_call_events_event_id").on(table.event_id),
		index("idx_ai_tool_call_events_tool_name").on(table.tool_name),
	],
);
