import { afterEach, describe, expect, test } from "bun:test";

import { createTestStore, makeEvent, makeFact } from "../test-utils";
import { vacuum } from "./sqlite";

describe("sqlite store workflows", () => {
	let store = createTestStore();

	afterEach(() => {
		store.close();
		store = createTestStore();
	});

	test("ingested event is findable via FTS5 search", async () => {
		const event = makeEvent({
			event_id: "evt-search",
			metadata: {
				command: "kubectl get pods -n kube-system",
				exit_code: 0,
				duration_ms: 25,
				cwd: "/tmp",
			},
		});

		await store.appendEvent(event, "shell");
		const results = await store.searchEvents("kubectl", 10);

		expect(results).toHaveLength(1);
		expect(results[0]?.event_id).toBe("evt-search");
		expect(results[0]?.schema_version).toBe(1);
	});

	test("fts5 search survives VACUUM with stable rowids", async () => {
		const event = makeEvent({
			event_id: "evt-vacuum",
			metadata: {
				command: "git log --oneline",
				exit_code: 0,
				duration_ms: 40,
				cwd: "/tmp",
			},
		});

		await store.appendEvent(event, "shell");
		vacuum(store.db);

		const results = await store.searchEvents("--oneline", 10);
		expect(results).toHaveLength(1);
		expect(results[0]?.event_id).toBe("evt-vacuum");
	});

	test("duplicate event_id is silently ignored", async () => {
		const event = makeEvent({ event_id: "evt-duplicate" });

		const first = await store.appendEvent(event, "shell");
		const second = await store.appendEvent(event, "shell");
		const rows = await store.getEvents({ limit: 10 });

		expect(first.id).toBe(second.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.event_id).toBe("evt-duplicate");
	});

	test("intel facts become pending when auto approve is disabled", async () => {
		store.close();
		store = createTestStore({
			intel: {
				auto_approve: false,
				max_daily_extractions: 500,
				model: {
					provider: "anthropic",
					model: "claude-sonnet-4-20250514",
				},
			},
		});

		const fact = await store.insertFact(makeFact({ created_by: "intel", status: "active" }));

		expect(fact.status).toBe("pending");
	});

	test("intel facts stay active when auto approve is enabled", async () => {
		const fact = await store.insertFact(makeFact({ created_by: "intel", status: "pending" }));

		expect(fact.status).toBe("active");
	});
});
