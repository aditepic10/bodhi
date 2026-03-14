import { describe, expect, test } from "bun:test";

import { createTestContext, makeFact } from "../test-utils";
import { createRetrievalPlanner } from "./planner";
import { createRetrievalService } from "./service";

describe("retrieval workflows", () => {
	test("planner infers shell activity intent and bounded time filters from natural language", () => {
		const planner = createRetrievalPlanner({
			now: () => new Date("2026-03-14T15:30:00.000Z"),
		});

		const plan = planner.plan("What commands have I run today?");

		expect(plan.eventTypes).toContain("shell.command.executed");
		expect(plan.limit).toBe(5);
		expect(plan.after).toBe(Math.floor(new Date("2026-03-14T00:00:00.000Z").getTime() / 1000));
		expect(plan.before).toBe(Math.floor(new Date("2026-03-14T15:30:00.000Z").getTime() / 1000));
	});

	test("retrieval returns recent shell events even when the question does not lexically match command text", async () => {
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
			store: context.store,
		});

		const result = await service.retrieve("What commands have I run?");

		expect(result.events).toHaveLength(1);
		expect(result.events[0]?.type).toBe("shell.command.executed");
		if (result.events[0]?.type !== "shell.command.executed") {
			throw new Error("expected shell event");
		}
		expect(result.events[0].metadata.command).toBe("git status");
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
