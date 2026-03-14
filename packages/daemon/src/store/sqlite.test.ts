import { afterEach, describe, expect, test } from "bun:test";
import type { BodhiEvent } from "@bodhi/types";

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
		const results = await store.searchEvents("kubectl", { limit: 10 });

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

		const results = await store.searchEvents("--oneline", { limit: 10 });
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
					model: "claude-sonnet-4-6",
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

	test("context filters return matching events across event families", async () => {
		await store.appendEvent(
			{
				context: {
					branch: "feature/auth",
					cwd: "/work/bodhi/packages/daemon",
					repo_id: "repo:bodhi",
					relative_cwd: "packages/daemon",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_000,
				event_id: "evt-context-shell",
				metadata: {
					command: "bun test",
					cwd: "/work/bodhi/packages/daemon",
					duration_ms: 42,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);
		await store.appendEvent(
			{
				context: {
					branch: "feature/auth",
					cwd: "/work/bodhi/packages/daemon",
					repo_id: "repo:bodhi",
					relative_cwd: "packages/daemon",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_050,
				event_id: "evt-context-git",
				metadata: {
					branch: "feature/auth",
					files: ["packages/daemon/src/store/sqlite/repository.ts"],
					files_changed: 1,
					hash: "abc12345",
					message: "feat: split event storage",
				},
				type: "git.commit.created",
			},
			"git",
		);
		await store.appendEvent(
			{
				context: {
					branch: "main",
					cwd: "/work/other",
					repo_id: "repo:other",
					tool: "shell.zsh",
					worktree_root: "/work/other",
				},
				created_at: 1_710_430_100,
				event_id: "evt-context-other",
				metadata: {
					command: "npm test",
					cwd: "/work/other",
					duration_ms: 21,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);

		const results = await store.getEvents({
			branch: "feature/auth",
			limit: 10,
			repo: "repo:bodhi",
		});

		expect(results).toHaveLength(2);
		expect(results.map((event) => event.event_id)).toEqual([
			"evt-context-git",
			"evt-context-shell",
		]);
	});

	test("git commit hydration preserves commit files and context", async () => {
		await store.appendEvent(
			{
				context: {
					branch: "feature/schema",
					cwd: "/work/bodhi/packages/daemon",
					repo_id: "repo:bodhi",
					relative_cwd: "packages/daemon",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_200,
				event_id: "evt-commit-files",
				metadata: {
					branch: "feature/schema",
					deletions: 4,
					files: ["packages/types/src/events.ts", "packages/daemon/src/store/events.sql.ts"],
					files_changed: 2,
					hash: "def67890",
					insertions: 12,
					message: "refactor: typed storage foundation",
				},
				type: "git.commit.created",
			},
			"git",
		);

		const [storedEvent] = await store.getEvents({ limit: 1, repo: "repo:bodhi" });
		if (!storedEvent || storedEvent.type !== "git.commit.created") {
			throw new Error("expected git commit event");
		}

		expect(storedEvent.context?.branch).toBe("feature/schema");
		expect(storedEvent.metadata.files).toEqual([
			"packages/types/src/events.ts",
			"packages/daemon/src/store/events.sql.ts",
		]);
		expect(storedEvent.metadata.insertions).toBe(12);
		expect(storedEvent.metadata.deletions).toBe(4);
	});

	test("every supported event type round-trips through typed storage", async () => {
		const events: BodhiEvent[] = [
			{
				context: {
					branch: "feature/typed-store",
					cwd: "/work/bodhi/packages/daemon",
					repo_id: "repo:bodhi",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_300,
				event_id: "evt-roundtrip-shell-executed",
				metadata: {
					command: "bun test",
					cwd: "/work/bodhi/packages/daemon",
					duration_ms: 99,
					exit_code: 1,
				},
				type: "shell.command.executed",
			},
			{
				context: {
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_301,
				event_id: "evt-roundtrip-shell-started",
				metadata: {
					command: "git status",
					cwd: "/work/bodhi",
				},
				type: "shell.command.started",
			},
			{
				context: {
					branch: "feature/typed-store",
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_302,
				event_id: "evt-roundtrip-commit",
				metadata: {
					branch: "feature/typed-store",
					deletions: 2,
					files: ["packages/daemon/src/store/sqlite/event-store.ts"],
					files_changed: 1,
					hash: "abc12345",
					insertions: 10,
					message: "feat: event store split",
				},
				type: "git.commit.created",
			},
			{
				context: {
					branch: "feature/typed-store",
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_303,
				event_id: "evt-roundtrip-checkout",
				metadata: {
					from_branch: "main",
					from_sha: "abc11111",
					is_file_checkout: false,
					to_branch: "feature/typed-store",
					to_sha: "abc22222",
				},
				type: "git.checkout",
			},
			{
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_304,
				event_id: "evt-roundtrip-merge",
				metadata: {
					branch: "main",
					is_squash: true,
					merged_branch: "feature/typed-store",
				},
				type: "git.merge",
			},
			{
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_305,
				event_id: "evt-roundtrip-rewrite",
				metadata: {
					rewritten_commits: 3,
					rewrite_type: "rebase",
				},
				type: "git.rewrite",
			},
			{
				context: {
					branch: "feature/typed-store",
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					thread_id: "claude-session-1",
					tool: "claude-code",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_306,
				event_id: "evt-roundtrip-ai-prompt",
				metadata: {
					content: "explain the new store architecture",
				},
				type: "ai.prompt",
			},
			{
				context: {
					branch: "feature/typed-store",
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					thread_id: "claude-session-1",
					tool: "claude-code",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_307,
				event_id: "evt-roundtrip-ai-tool",
				metadata: {
					description: "update event store",
					target: "packages/daemon/src/store/sqlite/event-store.ts",
					tool_name: "Edit",
				},
				type: "ai.tool_call",
			},
			{
				context: {
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					tool: "api",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_308,
				event_id: "evt-roundtrip-note",
				metadata: {
					content: "remember to benchmark context filters",
				},
				type: "note.created",
			},
		];

		for (const event of events) {
			await store.appendEvent(
				event,
				event.type.startsWith("git.")
					? "git"
					: event.type.startsWith("ai.")
						? "ai"
						: event.type === "note.created"
							? "manual"
							: "shell",
			);
		}

		const storedEvents = await store.getEvents({ limit: 20 });
		expect(storedEvents.map((event) => event.type).sort()).toEqual(
			events.map((event) => event.type).sort(),
		);
		expect(storedEvents.map((event) => event.event_id).sort()).toEqual(
			events.map((event) => event.event_id ?? "").sort(),
		);
	});

	test("deleting an envelope cascades to context and payload rows", async () => {
		await store.appendEvent(
			{
				context: {
					branch: "feature/cascade",
					cwd: "/work/bodhi",
					repo_id: "repo:bodhi",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				created_at: 1_710_430_400,
				event_id: "evt-cascade",
				metadata: {
					branch: "feature/cascade",
					files: ["packages/daemon/src/store/sqlite/event-registry.ts"],
					files_changed: 1,
					hash: "fff11111",
					message: "test: cascading delete",
				},
				type: "git.commit.created",
			},
			"git",
		);

		const envelopeId = store.db
			.query<{ id: string }, [string]>("SELECT id FROM events WHERE event_id = ? LIMIT 1")
			.get("evt-cascade")?.id;
		expect(envelopeId).toBeDefined();
		if (!envelopeId) {
			throw new Error("expected envelope id");
		}

		store.db.query("DELETE FROM events WHERE id = ?").run(envelopeId);

		const contextCount = store.db
			.query<{ count: number }, [string]>(
				"SELECT COUNT(*) as count FROM event_contexts WHERE event_id = ?",
			)
			.get(envelopeId)?.count;
		const payloadCount = store.db
			.query<{ count: number }, [string]>(
				"SELECT COUNT(*) as count FROM git_commit_events WHERE event_id = ?",
			)
			.get(envelopeId)?.count;
		const fileCount = store.db
			.query<{ count: number }, [string]>(
				"SELECT COUNT(*) as count FROM git_commit_files WHERE event_id = ?",
			)
			.get(envelopeId)?.count;

		expect(contextCount).toBe(0);
		expect(payloadCount).toBe(0);
		expect(fileCount).toBe(0);
	});
});
