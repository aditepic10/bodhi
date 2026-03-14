import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

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

export function migrateDatabase(db: Database): void {
	const migrationsFolder = new URL("../migrations", import.meta.url).pathname;
	migrate(drizzle(db), {
		migrationsFolder,
	});
}

export function ensureCoreSchema(db: Database): void {
	migrateDatabase(db);
}

export function setupFts(_db: Database): void {
	// FTS is migration-managed now.
}

export function vacuum(db: Database): void {
	db.exec("VACUUM");
}
