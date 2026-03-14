import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyPragmas, ensureCoreSchema, openDatabase } from "./sqlite";

function findMigrationFilename(prefix: string): string {
	const files = readdirSync(new URL("./migrations", import.meta.url));
	const match = files.find((file) => file.startsWith(prefix));
	if (!match) {
		throw new Error(`missing migration ${prefix}`);
	}
	return match;
}

function executeMigrationSql(db: ReturnType<typeof openDatabase>, filename: string): void {
	const sql = readFileSync(new URL(`./migrations/${filename}`, import.meta.url), "utf8");
	for (const statement of sql
		.split("--> statement-breakpoint")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)) {
		db.exec(statement);
	}
}

describe("sqlite migration workflows", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		while (tempDirs.length > 0) {
			const dir = tempDirs.pop();
			if (dir && existsSync(dir)) {
				rmSync(dir, { force: true, recursive: true });
			}
		}
	});

	test("baseline migration creates typed tables, fts tables, and triggers", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "bodhi-migrate-"));
		tempDirs.push(tempDir);
		const dbPath = join(tempDir, "bodhi.db");
		const db = openDatabase(dbPath);

		try {
			applyPragmas(db);
			ensureCoreSchema(db);

			const tables = db
				.query<{ name: string }, []>(
					`
						SELECT name FROM sqlite_master
						WHERE type = 'table'
						ORDER BY name ASC
					`,
				)
				.all()
				.map((row) => row.name);

			expect(tables).toEqual(
				expect.arrayContaining([
					"ai_prompt_events",
					"ai_tool_call_events",
					"chat_sessions",
					"conversations",
					"event_contexts",
					"events",
					"events_fts",
					"fact_links",
					"facts",
					"facts_fts",
					"git_checkout_events",
					"git_commit_events",
					"git_commit_files",
					"git_merge_events",
					"git_rewrite_events",
					"git_rewrite_mappings",
					"note_events",
					"shell_command_events",
				]),
			);

			const triggers = db
				.query<{ name: string }, []>(
					`
						SELECT name FROM sqlite_master
						WHERE type = 'trigger'
						ORDER BY name ASC
					`,
				)
				.all()
				.map((row) => row.name);

			expect(triggers).toEqual(
				expect.arrayContaining([
					"events_ad",
					"events_ai",
					"events_au",
					"facts_ad",
					"facts_ai",
					"facts_au",
				]),
			);
		} finally {
			db.close();
		}
	});

	test("baseline migration enables foreign keys and cascade relationships", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "bodhi-migrate-"));
		tempDirs.push(tempDir);
		const dbPath = join(tempDir, "bodhi.db");
		const db = openDatabase(dbPath);

		try {
			applyPragmas(db);
			ensureCoreSchema(db);

			const foreignKeysEnabled = db
				.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys")
				.get();
			expect(foreignKeysEnabled?.foreign_keys).toBe(1);

			const contextFks = db
				.query<{ table: string; from: string; on_delete: string }, []>(
					"PRAGMA foreign_key_list(event_contexts)",
				)
				.all();
			expect(contextFks).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						from: "event_id",
						on_delete: "CASCADE",
						table: "events",
					}),
				]),
			);

			const commitFileFks = db
				.query<{ table: string; from: string; on_delete: string }, []>(
					"PRAGMA foreign_key_list(git_commit_files)",
				)
				.all();
			expect(commitFileFks).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						from: "event_id",
						on_delete: "CASCADE",
						table: "events",
					}),
				]),
			);

			const conversationFks = db
				.query<{ table: string; from: string; on_delete: string }, []>(
					"PRAGMA foreign_key_list(conversations)",
				)
				.all();
			expect(conversationFks).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						from: "session_id",
						on_delete: "CASCADE",
						table: "chat_sessions",
					}),
				]),
			);
		} finally {
			db.close();
		}
	});

	test("0003 upgrade preserves historical conversation roles and adds chat metadata columns", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "bodhi-migrate-"));
		tempDirs.push(tempDir);
		const dbPath = join(tempDir, "bodhi.db");
		const db = openDatabase(dbPath);

		try {
			applyPragmas(db);
			executeMigrationSql(db, "0000_flaky_vivisector.sql");
			executeMigrationSql(db, "0001_git_lifecycle_phase_one.sql");
			executeMigrationSql(db, "0002_lazy_tigra.sql");

			db.exec(`
				INSERT INTO chat_sessions (session_id, created_at, updated_at)
				VALUES ('legacy-session', unixepoch(), unixepoch());
			`);
			db.exec(`
				INSERT INTO conversations (id, role, content, session_id, created_at)
				VALUES
					('conv-user', 'user', 'What is 2+2?', 'legacy-session', unixepoch()),
					('conv-assistant', 'assistant', '4', 'legacy-session', unixepoch())
			`);

			executeMigrationSql(db, findMigrationFilename("0003_"));

			const rows = db
				.query<{ content: string; content_json: string | null; role: string; status: string }, []>(`
					SELECT role, status, content_json, content
					FROM conversations
					WHERE session_id = 'legacy-session'
					ORDER BY id ASC
				`)
				.all();

			expect(rows).toEqual([
				{
					content: "4",
					content_json: null,
					role: "assistant",
					status: "complete",
				},
				{
					content: "What is 2+2?",
					content_json: null,
					role: "user",
					status: "complete",
				},
			]);
		} finally {
			db.close();
		}
	});

	test("conversation schema enforces valid role and status values", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "bodhi-migrate-"));
		tempDirs.push(tempDir);
		const dbPath = join(tempDir, "bodhi.db");
		const db = openDatabase(dbPath);

		try {
			applyPragmas(db);
			ensureCoreSchema(db);

			db.exec(`
				INSERT INTO chat_sessions (session_id, created_at, updated_at)
				VALUES ('session-check', unixepoch(), unixepoch())
			`);

			expect(() =>
				db.exec(`
					INSERT INTO conversations (
						id, role, status, content, session_id, created_at
					) VALUES (
						'conv-bad-role', 'narrator', 'complete', 'oops', 'session-check', unixepoch()
					)
				`),
			).toThrow();
			expect(() =>
				db.exec(`
					INSERT INTO conversations (
						id, role, status, content, session_id, created_at
					) VALUES (
						'conv-bad-status', 'user', 'mystery', 'oops', 'session-check', unixepoch()
					)
				`),
			).toThrow();
		} finally {
			db.close();
		}
	});
});
