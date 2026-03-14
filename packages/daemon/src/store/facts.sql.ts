import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";
import { unixEpochNow } from "./schema.sql";

export const factsTable = sqliteTable(
	"facts",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		id: text("id").notNull().unique(),
		key: text("key").notNull(),
		value: text("value").notNull(),
		created_by: text("created_by").notNull(),
		source_event_id: text("source_event_id").references(() => eventsTable.id, {
			onDelete: "set null",
		}),
		status: text("status").notNull().default("active"),
		confidence: real("confidence").notNull().default(1),
		schema_version: integer("schema_version").notNull().default(1),
		supersedes_fact_id: text("supersedes_fact_id"),
		extraction_meta: text("extraction_meta"),
		valid_from: integer("valid_from"),
		valid_to: integer("valid_to"),
		created_at: integer("created_at").notNull().default(unixEpochNow),
		updated_at: integer("updated_at").notNull().default(unixEpochNow),
	},
	(table) => [
		index("idx_facts_key").on(table.key),
		index("idx_facts_status").on(table.status),
		index("idx_facts_source_event").on(table.source_event_id),
		index("idx_facts_active").on(table.key, table.status, table.valid_to),
	],
);

export const factLinksTable = sqliteTable("fact_links", {
	_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
	id: text("id").notNull().unique(),
	fact_id_from: text("fact_id_from")
		.notNull()
		.references(() => factsTable.id),
	fact_id_to: text("fact_id_to")
		.notNull()
		.references(() => factsTable.id),
	relationship_type: text("relationship_type").notNull(),
	created_at: integer("created_at").notNull().default(unixEpochNow),
});
