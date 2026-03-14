import { Database } from "bun:sqlite";
import type {
	BodhiEvent,
	ConversationMessage,
	EventFilter,
	Fact,
	FactCreatedBy,
	FactFilter,
	FactStatus,
	Store,
	StoredEvent,
} from "@bodhi/types";
import { nanoid } from "nanoid";

import { nowUnix } from "./schema.sql";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

type StoredEventRow = {
	id: string;
	event_id: string;
	type: string;
	metadata: string;
	source: string;
	session_id: string | null;
	machine_id: string | null;
	schema_version: number;
	producer_version: string | null;
	created_at: number;
	processed_at: number | null;
	started_at: number | null;
};

type FactRow = {
	id: string;
	key: string;
	value: string;
	created_by: FactCreatedBy;
	source_event_id: string | null;
	status: FactStatus;
	confidence: number;
	schema_version: number;
	supersedes_fact_id: string | null;
	extraction_meta: string | null;
	valid_from: number | null;
	valid_to: number | null;
	created_at: number;
	updated_at: number;
};

export interface PipelineLike {
	process(event: BodhiEvent): BodhiEvent | null;
}

export interface SqliteStore extends Store {
	db: Database;
}

export interface CreateStoreOptions {
	autoApprove?: boolean;
}

export function openDatabase(source: string): Database {
	return new Database(source);
}

export function applyPragmas(db: Database): void {
	db.exec("PRAGMA auto_vacuum = INCREMENTAL");
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA busy_timeout = 5000");
	db.exec("PRAGMA synchronous = NORMAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA cache_size = -64000");
	db.exec("PRAGMA mmap_size = 268435456");
	db.exec("PRAGMA journal_size_limit = 67108864");
	db.exec("PRAGMA temp_store = MEMORY");
	db.exec("PRAGMA secure_delete = ON");
}

export function ensureCoreSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS events (
			_rowid INTEGER PRIMARY KEY,
			id TEXT NOT NULL UNIQUE,
			event_id TEXT NOT NULL UNIQUE,
			type TEXT NOT NULL,
			content TEXT,
			metadata TEXT NOT NULL,
			source TEXT NOT NULL,
			session_id TEXT,
			machine_id TEXT,
			schema_version INTEGER NOT NULL DEFAULT 1,
			producer_version TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			processed_at INTEGER,
			started_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
		CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
		CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);

		CREATE TABLE IF NOT EXISTS facts (
			_rowid INTEGER PRIMARY KEY,
			id TEXT NOT NULL UNIQUE,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			created_by TEXT NOT NULL,
			source_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
			status TEXT NOT NULL DEFAULT 'active',
			confidence REAL NOT NULL DEFAULT 1.0,
			schema_version INTEGER NOT NULL DEFAULT 1,
			supersedes_fact_id TEXT REFERENCES facts(id) ON DELETE SET NULL,
			extraction_meta TEXT,
			valid_from INTEGER,
			valid_to INTEGER,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(key);
		CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(status);
		CREATE INDEX IF NOT EXISTS idx_facts_source_event ON facts(source_event_id);
		CREATE INDEX IF NOT EXISTS idx_facts_active ON facts(key, status, valid_to);

		CREATE TABLE IF NOT EXISTS fact_links (
			_rowid INTEGER PRIMARY KEY,
			id TEXT NOT NULL UNIQUE,
			fact_id_from TEXT NOT NULL REFERENCES facts(id),
			fact_id_to TEXT NOT NULL REFERENCES facts(id),
			relationship_type TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		);

		CREATE TABLE IF NOT EXISTS conversations (
			_rowid INTEGER PRIMARY KEY,
			id TEXT NOT NULL UNIQUE,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			session_id TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
	`);
}

export function setupFts(db: Database): void {
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
			content,
			metadata,
			content=events,
			content_rowid=_rowid,
			tokenize="unicode61 tokenchars '-/_.'"
		);

		CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
			key,
			value,
			content=facts,
			content_rowid=_rowid
		);

		CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
			INSERT INTO events_fts(rowid, content, metadata) VALUES (new._rowid, new.content, new.metadata);
		END;

		CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
			INSERT INTO facts_fts(rowid, key, value) VALUES (new._rowid, new.key, new.value);
		END;

		CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
			INSERT INTO facts_fts(facts_fts, rowid, key, value) VALUES('delete', old._rowid, old.key, old.value);
			INSERT INTO facts_fts(rowid, key, value) VALUES (new._rowid, new.key, new.value);
		END;

		CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
			INSERT INTO events_fts(events_fts, rowid, content, metadata) VALUES('delete', old._rowid, old.content, old.metadata);
		END;

		CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
			INSERT INTO facts_fts(facts_fts, rowid, key, value) VALUES('delete', old._rowid, old.key, old.value);
		END;
	`);

	db.exec(`INSERT INTO events_fts(events_fts) VALUES('rebuild')`);
	db.exec(`INSERT INTO facts_fts(facts_fts) VALUES('rebuild')`);
}

function clampLimit(limit?: number): number {
	return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function deriveEventContent(event: BodhiEvent): string {
	switch (event.type) {
		case "shell.command.executed":
		case "shell.command.started":
			return event.metadata.command;
		case "git.commit.created":
			return `${event.metadata.branch} ${event.metadata.message}`;
		case "note.created":
			return event.metadata.content;
		case "fact.extracted":
			return `${event.metadata.key} ${event.metadata.value}`;
		case "conversation.message":
			return event.metadata.content;
	}

	return "";
}

function normalizeFtsQuery(query: string): string {
	return `"${query.replaceAll('"', '""')}"`;
}

function inferSource(type: string): StoredEvent["source"] {
	if (type.startsWith("shell.")) {
		return "shell";
	}
	if (type.startsWith("git.")) {
		return "git";
	}
	return "api";
}

function mapStoredEvent(row: StoredEventRow): StoredEvent {
	const metadata = JSON.parse(row.metadata) as StoredEvent["metadata"];
	return {
		type: row.type as BodhiEvent["type"],
		metadata,
		id: row.id,
		event_id: row.event_id,
		source: row.source as StoredEvent["source"],
		session_id: row.session_id ?? undefined,
		machine_id: row.machine_id ?? undefined,
		schema_version: row.schema_version,
		producer_version: row.producer_version ?? undefined,
		created_at: row.created_at,
		processed_at: row.processed_at ?? undefined,
		started_at: row.started_at ?? undefined,
	} as StoredEvent;
}

function mapFact(row: FactRow): Fact {
	return {
		id: row.id,
		key: row.key,
		value: row.value,
		created_by: row.created_by,
		source_event_id: row.source_event_id ?? undefined,
		status: row.status,
		confidence: row.confidence,
		schema_version: row.schema_version,
		supersedes_fact_id: row.supersedes_fact_id ?? undefined,
		extraction_meta: row.extraction_meta ?? undefined,
		valid_from: row.valid_from ?? undefined,
		valid_to: row.valid_to ?? undefined,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

function withImmediateTransaction<T>(db: Database, operation: () => T): T {
	db.exec("BEGIN IMMEDIATE");
	try {
		const result = operation();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}

function normalizeFactStatus(
	createdBy: FactCreatedBy,
	currentStatus: FactStatus,
	autoApprove: boolean,
): FactStatus {
	if (createdBy === "intel" || createdBy === "agent") {
		return autoApprove ? "active" : "pending";
	}

	return currentStatus;
}

export function createStore(db: Database, options: CreateStoreOptions = {}): SqliteStore {
	const autoApprove = options.autoApprove ?? true;

	return {
		db,
		async appendEvent(event: BodhiEvent, source: StoredEvent["source"]) {
			const id = nanoid();
			const eventId = event.event_id ?? nanoid();
			const createdAt = event.created_at ?? nowUnix();
			const schemaVersion = event.schema_version ?? 1;
			const metadata = JSON.stringify(event.metadata);
			const content = deriveEventContent(event);

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
				.query<StoredEventRow, [number]>(
					`
						SELECT * FROM events
						WHERE processed_at IS NULL
						ORDER BY created_at ASC, _rowid ASC
						LIMIT ?
					`,
				)
				.all(clampLimit(limit))
				.map(mapStoredEvent);
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

export function vacuum(db: Database): void {
	db.exec("VACUUM");
}

export function redactForEgress(events: StoredEvent[], pipeline: PipelineLike): StoredEvent[] {
	return events
		.map((event) => {
			const redacted = pipeline.process(event);
			if (!redacted) {
				return null;
			}

			return {
				...event,
				...redacted,
				metadata: redacted.metadata,
			} as StoredEvent;
		})
		.filter((event): event is StoredEvent => event !== null);
}

export function sourceForEvent(event: BodhiEvent): StoredEvent["source"] {
	return inferSource(event.type);
}
