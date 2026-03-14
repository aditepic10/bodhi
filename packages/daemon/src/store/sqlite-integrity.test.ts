import { afterEach, describe, expect, test } from "bun:test";

import { createTestStore } from "../test-utils";

describe("sqlite integrity boundaries", () => {
	let store = createTestStore();

	afterEach(() => {
		store.close();
		store = createTestStore();
	});

	test("invalid git_state in stored context fails loudly during hydration", async () => {
		store.db
			.query(
				`
					INSERT INTO events (id, event_id, type, source, schema_version, created_at)
					VALUES (?, ?, ?, ?, ?, ?)
				`,
			)
			.run(
				"evt-invalid-context-id",
				"evt-invalid-context",
				"note.created",
				"api",
				1,
				1_710_430_500,
			);
		store.db
			.query(
				`
					INSERT INTO event_contexts (event_id, git_state)
					VALUES (?, ?)
				`,
			)
			.run("evt-invalid-context-id", "totally-invalid");
		store.db
			.query(
				`
					INSERT INTO note_events (event_id, content)
					VALUES (?, ?)
				`,
			)
			.run("evt-invalid-context-id", "test note");

		await expect(store.getEvents({ limit: 10 })).rejects.toThrow();
	});

	test("invalid fact status in stored row fails loudly on read", async () => {
		store.db
			.query(
				`
					INSERT INTO facts (
						id, key, value, created_by, status, confidence, schema_version, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
			)
			.run(
				"fact-invalid-status",
				"editor",
				"vim",
				"intel",
				"mystery",
				1,
				1,
				1_710_430_600,
				1_710_430_600,
			);

		await expect(store.updateFact("fact-invalid-status", { value: "nvim" })).rejects.toThrow();
	});

	test("invalid conversation role is rejected at the sqlite boundary", async () => {
		store.db
			.query(
				`
					INSERT INTO chat_sessions (session_id, created_at, updated_at)
					VALUES (?, ?, ?)
				`,
			)
			.run("session-1", 1_710_430_700, 1_710_430_700);
		expect(() =>
			store.db
				.query(
					`
						INSERT INTO conversations (id, role, content, session_id, created_at)
						VALUES (?, ?, ?, ?, ?)
					`,
				)
				.run("conv-invalid-role", "narrator", "hello", "session-1", 1_710_430_700),
		).toThrow();
	});

	test("invalid conversation status is rejected at the sqlite boundary", async () => {
		store.db
			.query(
				`
					INSERT INTO chat_sessions (session_id, created_at, updated_at)
					VALUES (?, ?, ?)
				`,
			)
			.run("session-2", 1_710_430_701, 1_710_430_701);
		expect(() =>
			store.db
				.query(
					`
						INSERT INTO conversations (id, role, status, content, session_id, created_at)
						VALUES (?, ?, ?, ?, ?, ?)
					`,
				)
				.run("conv-invalid-status", "assistant", "mystery", "hello", "session-2", 1_710_430_701),
		).toThrow();
	});

	test("missing payload row fails loudly when hydrating an envelope", async () => {
		store.db
			.query(
				`
					INSERT INTO events (id, event_id, type, source, schema_version, created_at)
					VALUES (?, ?, ?, ?, ?, ?)
				`,
			)
			.run("evt-missing-payload-id", "evt-missing-payload", "ai.prompt", "ai", 1, 1_710_430_800);

		await expect(store.getEvents({ limit: 10 })).rejects.toThrow(
			"missing payload for event evt-missing-payload-id (ai.prompt)",
		);
	});
});
