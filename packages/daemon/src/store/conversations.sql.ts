import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { chatSessionsTable } from "./chat-sessions.sql";
import { unixEpochNow } from "./schema.sql";

export const conversationsTable = sqliteTable(
	"conversations",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		id: text("id").notNull().unique(),
		role: text("role").notNull(),
		status: text("status").notNull().default("complete"),
		content: text("content").notNull(),
		content_json: text("content_json"),
		session_id: text("session_id")
			.notNull()
			.references(() => chatSessionsTable.session_id, { onDelete: "cascade" }),
		created_at: integer("created_at").notNull().default(unixEpochNow),
	},
	(table) => [
		index("idx_conversations_session").on(table.session_id),
		check(
			"conversations_role_valid",
			sql.raw(textCheck("role", ["user", "assistant", "system", "tool"])),
		),
		check(
			"conversations_status_valid",
			sql.raw(textCheck("status", ["complete", "streaming", "error", "interrupted"])),
		),
	],
);

function textCheck(column: string, values: string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}
