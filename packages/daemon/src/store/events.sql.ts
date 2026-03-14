import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { unixEpochNow } from "./schema.sql";

export const eventsTable = sqliteTable(
	"events",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		id: text("id").notNull().unique(),
		event_id: text("event_id").notNull().unique(),
		type: text("type").notNull(),
		source: text("source").notNull(),
		session_id: text("session_id"),
		machine_id: text("machine_id"),
		search_text: text("search_text"),
		schema_version: integer("schema_version").notNull().default(1),
		producer_version: text("producer_version"),
		created_at: integer("created_at").notNull().default(unixEpochNow),
		processed_at: integer("processed_at"),
		started_at: integer("started_at"),
	},
	(table) => [
		index("idx_events_type").on(table.type),
		index("idx_events_created").on(table.created_at),
		index("idx_events_source").on(table.source),
		index("idx_events_type_created").on(table.type, table.created_at),
		uniqueIndex("idx_events_event_id").on(table.event_id),
	],
);
