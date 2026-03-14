import { Database } from "bun:sqlite";

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

export function vacuum(db: Database): void {
	db.exec("VACUUM");
}
