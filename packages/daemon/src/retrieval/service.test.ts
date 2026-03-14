import { describe, expect, test } from "bun:test";

import { createTestContext, makeFact } from "../test-utils";
import { createRetrievalPlanner } from "./planner";
import { createRetrievalService } from "./service";

describe("retrieval workflows", () => {
	test("planner infers recent activity and shell focus from natural language", () => {
		const planner = createRetrievalPlanner({
			now: () => new Date("2026-03-14T15:30:00.000Z"),
		});

		const plan = planner.plan("What commands have I run today?");

		expect(plan.intents).toContain("recent_activity");
		expect(plan.sources).toContain("shell");
		expect(plan.eventTypes).toContain("shell.command.executed");
		expect(plan.limit).toBe(5);
		expect(plan.after).toBe(Math.floor(new Date("2026-03-14T00:00:00.000Z").getTime() / 1000));
		expect(plan.before).toBe(Math.floor(new Date("2026-03-14T15:30:00.000Z").getTime() / 1000));
	});

	test("planner infers ai_help intent for assistant-oriented queries", () => {
		const planner = createRetrievalPlanner();

		const plan = planner.plan("What AI help did I just ask for?");

		expect(plan.intents).toContain("ai_help");
		expect(plan.sources).toContain("ai");
		expect(plan.eventTypes).toContain("ai.prompt");
		expect(plan.eventTypes).toContain("ai.tool_call");
	});

	test("retrieval prefers recent shell activity for command-oriented queries", async () => {
		const context = createTestContext();
		await context.store.appendEvent(
			{
				created_at: 1_710_430_000,
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-shell-1",
				metadata: {
					command: "git status",
					cwd: "/work/bodhi",
					duration_ms: 42,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);
		await context.store.appendEvent(
			{
				created_at: 1_710_430_100,
				event_id: "evt-retrieval-note-1",
				metadata: {
					content: "remember to ship docs",
				},
				type: "note.created",
			},
			"manual",
		);

		const service = createRetrievalService({
			now: () => 1_710_430_200,
			store: context.store,
		});

		const result = await service.retrieve("What commands have I run?");

		expect(result.events.length).toBeGreaterThan(0);
		expect(result.events[0]?.type).toBe("shell.command.executed");
		if (result.events[0]?.type !== "shell.command.executed") {
			throw new Error("expected shell event");
		}
		expect(result.events[0].metadata.command).toBe("git status");
	});

	test("retrieval surfaces recent ai prompts ahead of older unrelated git history for ai-help queries", async () => {
		const context = createTestContext();
		await context.store.appendEvent(
			{
				created_at: 1_710_430_000,
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-git-1",
				metadata: {
					files: ["README.md"],
					files_changed: 1,
					hash: "abc1234",
					message: "docs: update setup",
					parent_count: 1,
				},
				type: "git.commit.created",
			},
			"git",
		);
		await context.store.appendEvent(
			{
				created_at: 1_710_430_200,
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					thread_id: "claude-session-1",
					tool: "claude-code",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-ai-1",
				metadata: {
					content: "explain retrieval ranking",
				},
				type: "ai.prompt",
			},
			"ai",
		);

		const service = createRetrievalService({
			now: () => 1_710_430_250,
			store: context.store,
		});

		const result = await service.retrieve("What AI help did I just ask for?");

		expect(result.events[0]?.type).toBe("ai.prompt");
		if (result.events[0]?.type !== "ai.prompt") {
			throw new Error("expected ai prompt");
		}
		expect(result.events[0].metadata.content).toBe("explain retrieval ranking");
	});

	test("broad recent-activity queries surface mixed recent seams instead of older dense git history", async () => {
		const context = createTestContext();
		await context.store.appendEvent(
			{
				created_at: 1_710_430_000,
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-old-git-1",
				metadata: {
					files: ["README.md"],
					files_changed: 1,
					hash: "1111111",
					message: "docs: older update",
					parent_count: 1,
				},
				type: "git.commit.created",
			},
			"git",
		);
		await context.store.appendEvent(
			{
				created_at: 1_710_430_200,
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-recent-shell-1",
				metadata: {
					command: "bun test",
					cwd: "/work/bodhi",
					duration_ms: 120,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);
		await context.store.appendEvent(
			{
				created_at: 1_710_430_250,
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					thread_id: "claude-session-2",
					tool: "claude-code",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-recent-ai-1",
				metadata: {
					content: "help me understand failing tests",
				},
				type: "ai.prompt",
			},
			"ai",
		);

		const service = createRetrievalService({
			now: () => 1_710_430_300,
			store: context.store,
		});

		const result = await service.retrieve("What have I been up to?", {
			limit: 3,
		});

		expect(result.plan.intents).toContain("recent_activity");
		expect(result.events.map((event) => event.event_id)).toContain("evt-retrieval-recent-ai-1");
		expect(result.events.map((event) => event.event_id)).toContain("evt-retrieval-recent-shell-1");
		expect(result.events[0]?.event_id).toBe("evt-retrieval-recent-ai-1");
	});

	test("retrieval prefers authoritative git events over shell intent for git-history queries", async () => {
		const context = createTestContext();
		await context.store.appendEvent(
			{
				created_at: 1_710_431_000,
				context: {
					branch: "feature/auth",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-shell-git-1",
				metadata: {
					command: 'git commit -m "fix auth"',
					cwd: "/work/bodhi",
					duration_ms: 75,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);
		await context.store.appendEvent(
			{
				created_at: 1_710_431_010,
				context: {
					branch: "feature/auth",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "git.hook",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-git-commit-1",
				metadata: {
					files: ["auth.ts"],
					files_changed: 1,
					hash: "def5678",
					message: "fix: auth login flow",
					parent_count: 1,
				},
				type: "git.commit.created",
			},
			"git",
		);

		const service = createRetrievalService({
			now: () => 1_710_431_100,
			store: context.store,
		});

		const result = await service.retrieve("What happened on auth branch?", {
			branch: "feature/auth",
			repo: "/work/bodhi/.git",
		});

		expect(result.events[0]?.type).toBe("git.commit.created");
		if (result.events[0]?.type !== "git.commit.created") {
			throw new Error("expected git commit");
		}
		expect(result.events[0].metadata.message).toBe("fix: auth login flow");
	});

	test("retrieval stays bounded and returns only relevant facts instead of loading all stored facts", async () => {
		const context = createTestContext();
		await context.store.insertFact(
			makeFact({
				created_by: "api",
				key: "preferred_editor",
				status: "active",
				value: "neovim",
			}),
		);
		for (let index = 0; index < 20; index += 1) {
			await context.store.insertFact(
				makeFact({
					created_by: "api",
					key: `irrelevant_fact_${index}`,
					status: "active",
					value: `value-${index}`,
				}),
			);
		}

		const service = createRetrievalService({
			now: () => 1_710_431_500,
			store: context.store,
		});

		const result = await service.retrieve("What is my preferred editor?", {
			limit: 3,
		});

		expect(result.facts.length).toBeLessThanOrEqual(3);
		expect(result.facts.map((fact) => fact.key)).toContain("preferred_editor");
		expect(result.facts.map((fact) => fact.key)).not.toContain("irrelevant_fact_19");
	});

	test("retrieval applies typed repo and branch filters structurally", async () => {
		const context = createTestContext();
		await context.store.appendEvent(
			{
				created_at: 1_710_431_000,
				context: {
					branch: "main",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi",
				},
				event_id: "evt-retrieval-structural-1",
				metadata: {
					command: "bun test",
					cwd: "/work/bodhi",
					duration_ms: 1200,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);
		await context.store.appendEvent(
			{
				created_at: 1_710_431_100,
				context: {
					branch: "feature/auth",
					cwd: "/work/bodhi",
					repo_id: "/work/bodhi/.git",
					relative_cwd: ".",
					tool: "shell.zsh",
					worktree_root: "/work/bodhi-auth",
				},
				event_id: "evt-retrieval-structural-2",
				metadata: {
					command: "bun test",
					cwd: "/work/bodhi",
					duration_ms: 900,
					exit_code: 1,
				},
				type: "shell.command.executed",
			},
			"shell",
		);
		await context.store.appendEvent(
			{
				created_at: 1_710_431_200,
				context: {
					branch: "feature/auth",
					cwd: "/work/other",
					repo_id: "/work/other/.git",
					relative_cwd: ".",
					tool: "shell.zsh",
					worktree_root: "/work/other",
				},
				event_id: "evt-retrieval-structural-3",
				metadata: {
					command: "bun test",
					cwd: "/work/other",
					duration_ms: 1000,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);

		const service = createRetrievalService({
			now: () => 1_710_431_300,
			store: context.store,
		});

		const result = await service.retrieve("What commands have I run?", {
			branch: "feature/auth",
			repo: "/work/bodhi/.git",
		});

		expect(result.plan.branch).toBe("feature/auth");
		expect(result.plan.repo).toBe("/work/bodhi/.git");
		expect(result.events).toHaveLength(1);
		expect(result.events[0]?.event_id).toBe("evt-retrieval-structural-2");
	});
});
