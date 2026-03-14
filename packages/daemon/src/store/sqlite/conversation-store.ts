import type { Database } from "bun:sqlite";
import { type ConversationMessage, ConversationRoleSchema } from "@bodhi/types";
import { asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";

import { conversationsTable } from "../conversations.sql";
import { nowUnix } from "../schema.sql";
import type { SqliteStore } from "./types";

type ConversationStoreMethods = Pick<
	SqliteStore,
	"appendMessage" | "getConversation" | "pruneConversations"
>;

export function createConversationStore(db: Database): ConversationStoreMethods {
	const orm = drizzle(db);

	return {
		async appendMessage(
			role: "user" | "assistant" | "system",
			content: string,
			session_id: string,
		) {
			const id = nanoid();
			orm
				.insert(conversationsTable)
				.values({
					content,
					created_at: nowUnix(),
					id,
					role,
					session_id,
				})
				.run();
			return id;
		},
		async getConversation(session_id: string): Promise<ConversationMessage[]> {
			return orm
				.select({
					content: conversationsTable.content,
					role: conversationsTable.role,
				})
				.from(conversationsTable)
				.where(eq(conversationsTable.session_id, session_id))
				.orderBy(asc(conversationsTable.created_at), asc(conversationsTable._rowid))
				.all()
				.map((row) => ({
					content: row.content,
					role: ConversationRoleSchema.parse(row.role),
				}));
		},
		async pruneConversations(maxSessions: number) {
			if (maxSessions <= 0) {
				return 0;
			}

			const sessions = orm
				.select({ session_id: conversationsTable.session_id })
				.from(conversationsTable)
				.groupBy(conversationsTable.session_id)
				.orderBy(desc(sql`max(${conversationsTable.created_at})`))
				.all()
				.slice(maxSessions);

			for (const session of sessions) {
				orm
					.delete(conversationsTable)
					.where(eq(conversationsTable.session_id, session.session_id))
					.run();
			}

			return sessions.length;
		},
	};
}
