import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { chatSessionsTable } from "./chat-sessions.sql";
import { unixEpochNow } from "./schema.sql";

export const conversationsTable = sqliteTable(
	"conversations",
	{
		_rowid: integer("_rowid").primaryKey({ autoIncrement: true }),
		id: text("id").notNull().unique(),
		role: text("role").notNull(),
		content: text("content").notNull(),
		session_id: text("session_id")
			.notNull()
			.references(() => chatSessionsTable.session_id, { onDelete: "cascade" }),
		created_at: integer("created_at").notNull().default(unixEpochNow),
	},
	(table) => [index("idx_conversations_session").on(table.session_id)],
);
