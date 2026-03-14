import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { eventsTable } from "./events.sql";

export const gitRewriteMappingsTable = sqliteTable(
	"git_rewrite_mappings",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		id: text("id").notNull().unique(),
		event_id: text("event_id")
			.notNull()
			.references(() => eventsTable.id, { onDelete: "cascade" }),
		old_commit_sha: text("old_commit_sha").notNull(),
		new_commit_sha: text("new_commit_sha").notNull(),
	},
	(table) => [
		uniqueIndex("idx_git_rewrite_mappings_id").on(table.id),
		index("idx_git_rewrite_mappings_event_id").on(table.event_id),
	],
);
