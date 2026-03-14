import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyPragmas, ensureCoreSchema, openDatabase } from "./sqlite";

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
		} finally {
			db.close();
		}
	});
});
