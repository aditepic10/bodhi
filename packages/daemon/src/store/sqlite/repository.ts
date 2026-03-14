import type { Database } from "bun:sqlite";
import type { ConversationMessage, EventFilter, Fact, FactFilter, StoredEvent } from "@bodhi/types";
import { nanoid } from "nanoid";

import { nowUnix } from "../schema.sql";
import {
	clampLimit,
	eventContentForStorage,
	mapFact,
	mapStoredEvent,
	normalizeFactStatus,
	normalizeFtsQuery,
	withImmediateTransaction,
} from "./helpers";
import type { CreateStoreOptions, FactRow, SqliteStore, StoredEventRow } from "./types";
import { INTEL_VISIBILITY_TIMEOUT_SECONDS } from "./types";

export function createStore(db: Database, options: CreateStoreOptions = {}): SqliteStore {
	const autoApprove = options.autoApprove ?? true;

	return {
		db,
		async appendEvent(event, source: StoredEvent["source"]) {
			const id = nanoid();
			const eventId = event.event_id ?? nanoid();
			const createdAt = event.created_at ?? nowUnix();
			const schemaVersion = event.schema_version ?? 1;
			const metadata = JSON.stringify(event.metadata);
			const content = eventContentForStorage(event);

			withImmediateTransaction(db, () => {
				db.query(
					`
						INSERT OR IGNORE INTO events (
							id, event_id, type, content, metadata, source, session_id, machine_id,
							schema_version, producer_version, created_at
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`,
				).run(
					id,
					eventId,
					event.type,
					content,
					metadata,
					source,
					event.session_id ?? null,
					event.machine_id ?? null,
					schemaVersion,
					event.producer_version ?? null,
					createdAt,
				);
			});

			const row = db
				.query<StoredEventRow, [string]>(`SELECT * FROM events WHERE event_id = ? LIMIT 1`)
				.get(eventId);
			if (!row) {
				throw new Error(`failed to append event ${eventId}`);
			}

			return mapStoredEvent(row);
		},
		async getEvents(filter: EventFilter = {}) {
			const clauses: string[] = [];
			const params: Array<number | string> = [];

			if (filter.type) {
				clauses.push("type = ?");
				params.push(filter.type);
			}
			if (filter.source) {
				clauses.push("source = ?");
				params.push(filter.source);
			}
			if (filter.after) {
				clauses.push("created_at >= ?");
				params.push(filter.after);
			}
			if (filter.before) {
				clauses.push("created_at <= ?");
				params.push(filter.before);
			}

			const sql = `
				SELECT * FROM events
				${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
				ORDER BY created_at DESC, _rowid DESC
				LIMIT ?
			`;
			params.push(clampLimit(filter.limit));

			return db
				.query<StoredEventRow, Array<number | string>>(sql)
				.all(...params)
				.map(mapStoredEvent);
		},
		async searchEvents(query: string, limit?: number) {
			return db
				.query<StoredEventRow, [string, number]>(
					`
						SELECT e.* FROM events_fts f
						JOIN events e ON e._rowid = f.rowid
						WHERE events_fts MATCH ?
						ORDER BY bm25(events_fts), e.created_at DESC
						LIMIT ?
					`,
				)
				.all(normalizeFtsQuery(query), clampLimit(limit))
				.map(mapStoredEvent);
		},
		async getUnprocessedEvents(limit?: number) {
			return db
				.query<StoredEventRow, [number, number]>(
					`
						SELECT * FROM events
						WHERE processed_at IS NULL
						AND (started_at IS NULL OR started_at <= ?)
						ORDER BY created_at ASC, _rowid ASC
						LIMIT ?
					`,
				)
				.all(nowUnix() - INTEL_VISIBILITY_TIMEOUT_SECONDS, clampLimit(limit))
				.map(mapStoredEvent);
		},
		async markStarted(id: string) {
			db.query(`UPDATE events SET started_at = ? WHERE id = ?`).run(nowUnix(), id);
		},
		async markProcessed(id: string) {
			db.query(`UPDATE events SET processed_at = ?, started_at = NULL WHERE id = ?`).run(
				nowUnix(),
				id,
			);
		},
		async insertFact(fact: Omit<Fact, "id" | "created_at" | "updated_at">) {
			const id = nanoid();
			const timestamp = nowUnix();
			const status = normalizeFactStatus(fact.created_by, fact.status, autoApprove);

			withImmediateTransaction(db, () => {
				db.query(
					`
						INSERT INTO facts (
							id, key, value, created_by, source_event_id, status, confidence,
							schema_version, supersedes_fact_id, extraction_meta, valid_from, valid_to,
							created_at, updated_at
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`,
				).run(
					id,
					fact.key,
					fact.value,
					fact.created_by,
					fact.source_event_id ?? null,
					status,
					fact.confidence,
					fact.schema_version,
					fact.supersedes_fact_id ?? null,
					fact.extraction_meta ?? null,
					fact.valid_from ?? null,
					fact.valid_to ?? null,
					timestamp,
					timestamp,
				);
			});

			const row = db.query<FactRow, [string]>(`SELECT * FROM facts WHERE id = ? LIMIT 1`).get(id);
			if (!row) {
				throw new Error(`failed to insert fact ${id}`);
			}

			return mapFact(row);
		},
		async updateFact(id: string, updates: Partial<Fact>) {
			const existing = db
				.query<FactRow, [string]>(`SELECT * FROM facts WHERE id = ? LIMIT 1`)
				.get(id);
			if (!existing) {
				throw new Error(`fact not found: ${id}`);
			}

			const merged = {
				...mapFact(existing),
				...updates,
				updated_at: nowUnix(),
			};

			db.query(
				`
					UPDATE facts
					SET key = ?, value = ?, created_by = ?, source_event_id = ?, status = ?, confidence = ?,
						schema_version = ?, supersedes_fact_id = ?, extraction_meta = ?, valid_from = ?,
						valid_to = ?, updated_at = ?
					WHERE id = ?
				`,
			).run(
				merged.key,
				merged.value,
				merged.created_by,
				merged.source_event_id ?? null,
				merged.status,
				merged.confidence,
				merged.schema_version,
				merged.supersedes_fact_id ?? null,
				merged.extraction_meta ?? null,
				merged.valid_from ?? null,
				merged.valid_to ?? null,
				merged.updated_at,
				id,
			);

			const updated = db
				.query<FactRow, [string]>(`SELECT * FROM facts WHERE id = ? LIMIT 1`)
				.get(id);
			if (!updated) {
				throw new Error(`failed to update fact ${id}`);
			}

			return mapFact(updated);
		},
		async getFacts(filter: FactFilter = {}) {
			const clauses: string[] = [];
			const params: Array<number | string> = [];

			if (filter.key) {
				clauses.push("key = ?");
				params.push(filter.key);
			}
			if (filter.created_by) {
				clauses.push("created_by = ?");
				params.push(filter.created_by);
			}

			if (filter.status) {
				clauses.push("status = ?");
				params.push(filter.status);
			} else {
				clauses.push("status = 'active'");
			}

			if (filter.active_only) {
				clauses.push("valid_to IS NULL");
			}

			const sql = `
				SELECT * FROM facts
				${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
				ORDER BY created_at DESC, _rowid DESC
				LIMIT ?
			`;
			params.push(clampLimit(filter.limit));

			return db
				.query<FactRow, Array<number | string>>(sql)
				.all(...params)
				.map(mapFact);
		},
		async searchFacts(query: string, limit?: number) {
			return db
				.query<FactRow, [string, number]>(
					`
						SELECT f.* FROM facts_fts x
						JOIN facts f ON f._rowid = x.rowid
						WHERE facts_fts MATCH ?
						AND f.status = 'active'
						ORDER BY bm25(facts_fts), f.created_at DESC
						LIMIT ?
					`,
				)
				.all(normalizeFtsQuery(query), clampLimit(limit))
				.map(mapFact);
		},
		async invalidateFact(id: string) {
			db.query(`UPDATE facts SET valid_to = ?, updated_at = ? WHERE id = ?`).run(
				nowUnix(),
				nowUnix(),
				id,
			);
		},
		async appendMessage(
			role: "user" | "assistant" | "system",
			content: string,
			session_id: string,
		) {
			const id = nanoid();
			db.query(
				`INSERT INTO conversations (id, role, content, session_id, created_at) VALUES (?, ?, ?, ?, ?)`,
			).run(id, role, content, session_id, nowUnix());
			return id;
		},
		async getConversation(session_id: string): Promise<ConversationMessage[]> {
			return db
				.query<{ role: "user" | "assistant" | "system"; content: string }, [string]>(
					`SELECT role, content FROM conversations WHERE session_id = ? ORDER BY created_at ASC, _rowid ASC`,
				)
				.all(session_id);
		},
		async pruneConversations(maxSessions: number) {
			if (maxSessions <= 0) {
				return 0;
			}

			const sessions = db
				.query<{ session_id: string }, [number]>(
					`
						SELECT session_id FROM conversations
						GROUP BY session_id
						ORDER BY MAX(created_at) DESC
						LIMIT -1 OFFSET ?
					`,
				)
				.all(maxSessions);

			if (sessions.length === 0) {
				return 0;
			}

			for (const session of sessions) {
				db.query(`DELETE FROM conversations WHERE session_id = ?`).run(session.session_id);
			}

			return sessions.length;
		},
		close() {
			db.close();
		},
	};
}
