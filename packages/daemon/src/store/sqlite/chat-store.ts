import type { Database } from "bun:sqlite";
import {
	type ChatSession,
	ChatSessionListEntrySchema,
	ChatSessionSchema,
	type ConversationMessage,
	ConversationRoleSchema,
	ConversationStatusSchema,
	ConversationTurnSchema,
} from "@bodhi/types";
import { asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";

import { redactSensitiveString } from "../../pipeline/transforms/redact";
import { chatSessionsTable } from "../chat-sessions.sql";
import { conversationsTable } from "../conversations.sql";
import { nowUnix } from "../schema.sql";
import type { SqliteStore } from "./types";

const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 100;
const SESSION_PREVIEW_MAX = 140;
const SESSION_TITLE_MAX = 80;

type ChatStoreMethods = Pick<
	SqliteStore,
	| "appendMessage"
	| "getChatSession"
	| "getConversation"
	| "listChatSessions"
	| "pruneChatSessions"
	| "upsertChatSession"
>;

type ChatSessionRow = typeof chatSessionsTable.$inferSelect;

function normalizeSnippet(value: string, maxLength: number): string | null {
	const normalized = redactSensitiveString(value).replace(/\s+/g, " ").trim();
	if (normalized.length === 0) {
		return null;
	}

	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function toChatSession(row: ChatSessionRow): ChatSession {
	return ChatSessionSchema.parse({
		branch: row.branch ?? undefined,
		created_at: row.created_at,
		cwd: row.cwd ?? undefined,
		last_user_message_preview: row.last_user_message_preview ?? undefined,
		repo_id: row.repo_id ?? undefined,
		session_id: row.session_id,
		title: row.title ?? undefined,
		updated_at: row.updated_at,
		worktree_root: row.worktree_root ?? undefined,
	});
}

export function createChatStore(db: Database): ChatStoreMethods {
	const orm = drizzle(db);

	function getSessionRow(sessionId: string): ChatSessionRow | undefined {
		return orm
			.select()
			.from(chatSessionsTable)
			.where(eq(chatSessionsTable.session_id, sessionId))
			.get();
	}

	function ensureSessionRow(sessionId: string): ChatSessionRow {
		const existing = getSessionRow(sessionId);
		if (existing) {
			return existing;
		}

		const timestamp = nowUnix();
		orm
			.insert(chatSessionsTable)
			.values({
				created_at: timestamp,
				session_id: sessionId,
				updated_at: timestamp,
			})
			.run();
		const created = getSessionRow(sessionId);
		if (!created) {
			throw new Error(`failed to create chat session ${sessionId}`);
		}
		return created;
	}

	return {
		async appendMessage(
			role: "user" | "assistant" | "system" | "tool",
			content: string,
			session_id: string,
			options: {
				content_json?: string;
				status?: "complete" | "streaming" | "error" | "interrupted";
			} = {},
		) {
			const session = ensureSessionRow(session_id);
			const id = nanoid();
			const timestamp = nowUnix();
			const parsedRole = ConversationRoleSchema.parse(role);
			const status = ConversationStatusSchema.parse(options.status ?? "complete");

			orm
				.insert(conversationsTable)
				.values({
					content,
					content_json: options.content_json ?? null,
					created_at: timestamp,
					id,
					role: parsedRole,
					session_id,
					status,
				})
				.run();

			const updates: Partial<typeof chatSessionsTable.$inferInsert> = {
				updated_at: timestamp,
			};
			if (parsedRole === "user") {
				const preview = normalizeSnippet(content, SESSION_PREVIEW_MAX);
				updates.last_user_message_preview = preview;
				if (!session.title) {
					updates.title = normalizeSnippet(content, SESSION_TITLE_MAX);
				}
			}

			orm
				.update(chatSessionsTable)
				.set(updates)
				.where(eq(chatSessionsTable.session_id, session_id))
				.run();

			return id;
		},
		async upsertChatSession(session) {
			const existing = getSessionRow(session.session_id);
			const timestamp = nowUnix();

			if (!existing) {
				orm
					.insert(chatSessionsTable)
					.values({
						branch: session.branch ?? null,
						created_at: timestamp,
						cwd: session.cwd ?? null,
						repo_id: session.repo_id ?? null,
						session_id: session.session_id,
						updated_at: timestamp,
						worktree_root: session.worktree_root ?? null,
					})
					.run();
			} else {
				orm
					.update(chatSessionsTable)
					.set({
						branch: existing.branch ?? session.branch,
						cwd: existing.cwd ?? session.cwd,
						repo_id: existing.repo_id ?? session.repo_id,
						updated_at: timestamp,
						worktree_root: existing.worktree_root ?? session.worktree_root,
					})
					.where(eq(chatSessionsTable.session_id, session.session_id))
					.run();
			}

			const row = getSessionRow(session.session_id);
			if (!row) {
				throw new Error(`missing chat session ${session.session_id}`);
			}
			return toChatSession(row);
		},
		async getChatSession(session_id: string) {
			const row = getSessionRow(session_id);
			return row ? toChatSession(row) : null;
		},
		async listChatSessions(filter = {}) {
			const limit = Math.min(Math.max(filter.limit ?? DEFAULT_SESSION_LIMIT, 1), MAX_SESSION_LIMIT);
			const workspaceRank = sql<number>`case
				when ${filter.repo_id ?? null} is not null and ${chatSessionsTable.repo_id} = ${filter.repo_id ?? null} then 0
				when ${filter.worktree_root ?? null} is not null and ${chatSessionsTable.worktree_root} = ${filter.worktree_root ?? null} then 1
				when ${filter.cwd ?? null} is not null and ${chatSessionsTable.cwd} = ${filter.cwd ?? null} then 2
				else 3
			end`;

			const rows = orm
				.select({
					branch: chatSessionsTable.branch,
					created_at: chatSessionsTable.created_at,
					cwd: chatSessionsTable.cwd,
					last_user_message_preview: chatSessionsTable.last_user_message_preview,
					repo_id: chatSessionsTable.repo_id,
					session_id: chatSessionsTable.session_id,
					title: chatSessionsTable.title,
					updated_at: chatSessionsTable.updated_at,
					worktree_root: chatSessionsTable.worktree_root,
					workspace_rank: workspaceRank,
				})
				.from(chatSessionsTable)
				.orderBy(
					workspaceRank,
					desc(chatSessionsTable.updated_at),
					desc(chatSessionsTable.created_at),
					desc(chatSessionsTable.session_id),
				)
				.limit(limit)
				.all();

			return rows.map((row) =>
				ChatSessionListEntrySchema.parse({
					branch: row.branch ?? undefined,
					created_at: row.created_at,
					cwd: row.cwd ?? undefined,
					last_user_message_preview: row.last_user_message_preview ?? undefined,
					repo_id: row.repo_id ?? undefined,
					session_id: row.session_id,
					title: row.title ?? undefined,
					updated_at: row.updated_at,
					worktree_root: row.worktree_root ?? undefined,
					workspace_rank: row.workspace_rank,
				}),
			);
		},
		async getConversation(session_id: string): Promise<ConversationMessage[]> {
			return orm
				.select({
					content: conversationsTable.content,
					content_json: conversationsTable.content_json,
					role: conversationsTable.role,
					status: conversationsTable.status,
				})
				.from(conversationsTable)
				.where(eq(conversationsTable.session_id, session_id))
				.orderBy(asc(conversationsTable.created_at), asc(conversationsTable._rowid))
				.all()
				.map((row) =>
					ConversationTurnSchema.parse({
						content: row.content,
						content_json: row.content_json ?? undefined,
						role: ConversationRoleSchema.parse(row.role),
						status: ConversationStatusSchema.parse(row.status),
					}),
				);
		},
		async pruneChatSessions(maxSessions: number) {
			if (maxSessions <= 0) {
				return 0;
			}

			const sessions = orm
				.select({ session_id: chatSessionsTable.session_id })
				.from(chatSessionsTable)
				.orderBy(
					desc(chatSessionsTable.updated_at),
					desc(chatSessionsTable.created_at),
					desc(chatSessionsTable.session_id),
				)
				.all()
				.slice(maxSessions);

			for (const session of sessions) {
				orm
					.delete(chatSessionsTable)
					.where(eq(chatSessionsTable.session_id, session.session_id))
					.run();
			}

			return sessions.length;
		},
	};
}
