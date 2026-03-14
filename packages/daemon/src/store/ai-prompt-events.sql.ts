import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const aiPromptEventsTable = sqliteTable(
	"ai_prompt_events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		event_id: text("event_id")
			.notNull()
			.unique()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		content: text("content").notNull(),
	},
	(table) => [uniqueIndex("idx_ai_prompt_events_event_id").on(table.event_id)],
);
