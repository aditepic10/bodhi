import { describe, expect, test } from "bun:test";
import type { LanguageModel } from "ai";
import { createTestContext } from "../test-utils";
import { createAgentLoop } from "./loop";

type StubUsage = {
	inputTokens: {
		cacheRead: number | undefined;
		cacheWrite: number | undefined;
		noCache: number | undefined;
		total: number | undefined;
	};
	outputTokens: {
		reasoning: number | undefined;
		text: number | undefined;
		total: number | undefined;
	};
};

type StubStreamPart =
	| { type: "stream-start"; warnings: [] }
	| { id: string; type: "text-start" }
	| { delta: string; id: string; type: "text-delta" }
	| { id: string; type: "text-end" }
	| {
			finishReason: { raw: string; unified: "stop" | "tool-calls" };
			type: "finish";
			usage: StubUsage;
	  }
	| {
			input: string;
			toolCallId: string;
			toolName: string;
			type: "tool-call";
	  };

type StubGenerateResult = {
	content: Array<{ text: string; type: "text" }>;
	finishReason: { raw: string; unified: "stop" };
	usage: StubUsage;
	warnings: [];
};

type StubV3Model = {
	doGenerate(_options: unknown): Promise<StubGenerateResult>;
	doStream(_options: unknown): Promise<{ stream: ReadableStream<StubStreamPart> }>;
	modelId: string;
	provider: string;
	specificationVersion: "v3";
	supportedUrls: Record<string, never>;
};

function createStreamModel(
	streams: Array<Array<StubStreamPart>>,
	onCall?: (options: Record<string, unknown>, callIndex: number) => void,
): LanguageModel {
	let callIndex = 0;

	return {
		modelId: "mock-agent-model",
		provider: "mock-agent-provider",
		specificationVersion: "v3",
		supportedUrls: {},
		async doGenerate(_options: unknown): Promise<StubGenerateResult> {
			throw new Error("doGenerate not implemented for stream model");
		},
		async doStream(options: unknown): Promise<{ stream: ReadableStream<StubStreamPart> }> {
			onCall?.((options ?? {}) as Record<string, unknown>, callIndex);
			const parts: StubStreamPart[] = streams[callIndex] ?? [];
			callIndex += 1;
			return {
				stream: new ReadableStream<StubStreamPart>({
					start(controller) {
						for (const part of parts) {
							controller.enqueue(part);
						}
						controller.close();
					},
				}),
			};
		},
	} satisfies StubV3Model;
}

describe("agent workflows", () => {
	test("system prompt datamarks active facts and excludes pending facts", async () => {
		const context = createTestContext();
		await context.store.insertFact({
			confidence: 0.9,
			created_by: "api",
			extraction_meta: undefined,
			key: "preferred_editor",
			schema_version: 1,
			source_event_id: undefined,
			status: "active",
			supersedes_fact_id: undefined,
			valid_from: undefined,
			valid_to: undefined,
			value: "neovim",
		});
		await context.store.insertFact({
			confidence: 0.7,
			created_by: "api",
			extraction_meta: undefined,
			key: "draft_secret",
			schema_version: 1,
			source_event_id: undefined,
			status: "pending",
			supersedes_fact_id: undefined,
			valid_from: undefined,
			valid_to: undefined,
			value: "should-not-appear",
		});

		let capturedPrompt = "";
		const model = createStreamModel(
			[
				[
					{ type: "stream-start", warnings: [] },
					{ id: "text-1", type: "text-start" },
					{ delta: "Use neovim.", id: "text-1", type: "text-delta" },
					{ id: "text-1", type: "text-end" },
					{
						finishReason: { raw: "stop", unified: "stop" },
						type: "finish",
						usage: {
							inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
							outputTokens: { reasoning: undefined, text: 1, total: 1 },
						},
					},
				],
			],
			(options) => {
				capturedPrompt = JSON.stringify(options.prompt);
			},
		);

		const loop = createAgentLoop({
			bus: context.bus,
			config: context.config,
			model,
			pipeline: context.pipeline,
			store: context.store,
		});
		const { result } = await loop.stream({
			message: "What editor do I use?",
			sessionId: "session-1",
		});

		expect(await result.text).toBe("Use neovim.");
		expect(capturedPrompt).toContain("[UNTRUSTED DATA START]");
		expect(capturedPrompt).toContain("preferred_editor: neovim");
		expect(capturedPrompt).not.toContain("draft_secret");
		expect(
			(await context.store.getConversation("session-1")).map((entry) => entry.content),
		).toEqual(["What editor do I use?", "Use neovim."]);
	});

	test("tool loop can store an agent fact and finish with text", async () => {
		const context = createTestContext();
		const model = createStreamModel([
			[
				{ type: "stream-start", warnings: [] },
				{
					input: JSON.stringify({
						confidence: 0.92,
						key: "preferred_shell",
						value: "zsh",
					}),
					toolCallId: "call-1",
					toolName: "store-fact",
					type: "tool-call",
				},
				{
					finishReason: { raw: "tool-calls", unified: "tool-calls" },
					type: "finish",
					usage: {
						inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
						outputTokens: { reasoning: undefined, text: 1, total: 1 },
					},
				},
			],
			[
				{ type: "stream-start", warnings: [] },
				{ id: "text-2", type: "text-start" },
				{ delta: "I stored that your preferred shell is zsh.", id: "text-2", type: "text-delta" },
				{ id: "text-2", type: "text-end" },
				{
					finishReason: { raw: "stop", unified: "stop" },
					type: "finish",
					usage: {
						inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
						outputTokens: { reasoning: undefined, text: 1, total: 1 },
					},
				},
			],
		]);

		const loop = createAgentLoop({
			bus: context.bus,
			config: context.config,
			model,
			pipeline: context.pipeline,
			store: context.store,
		});
		const { result } = await loop.stream({
			message: "Remember that I use zsh.",
			sessionId: "session-2",
		});

		expect(await result.text).toContain("preferred shell is zsh");
		const facts = await context.store.getFacts({ key: "preferred_shell", status: "active" });
		expect(facts).toHaveLength(1);
		expect(facts[0]?.created_by).toBe("agent");
		expect(facts[0]?.value).toBe("zsh");
	});

	test("recall uses retrieved shell memory before generation instead of answering from an empty prompt", async () => {
		const context = createTestContext();
		await context.store.appendEvent(
			{
				created_at: 1_710_430_000,
				event_id: "evt-agent-recall-shell-1",
				metadata: {
					command: "git status",
					cwd: "/work/bodhi",
					duration_ms: 12,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);

		let capturedPrompt = "";
		const model = createStreamModel(
			[
				[
					{ type: "stream-start", warnings: [] },
					{ id: "text-3", type: "text-start" },
					{ delta: "You ran git status.", id: "text-3", type: "text-delta" },
					{ id: "text-3", type: "text-end" },
					{
						finishReason: { raw: "stop", unified: "stop" },
						type: "finish",
						usage: {
							inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
							outputTokens: { reasoning: undefined, text: 1, total: 1 },
						},
					},
				],
			],
			(options) => {
				capturedPrompt = JSON.stringify(options.prompt);
			},
		);

		const loop = createAgentLoop({
			bus: context.bus,
			config: context.config,
			model,
			pipeline: context.pipeline,
			store: context.store,
		});
		const { result } = await loop.stream({
			message: "What commands have I run?",
			sessionId: "session-recall-1",
		});

		expect(await result.text).toContain("git status");
		expect(capturedPrompt).toContain("git status");
		expect(capturedPrompt).toContain("shell.command.executed");
	});

	test("agent loop passes configured max output tokens to the model", async () => {
		const context = createTestContext({
			agent: {
				max_output_tokens: 2048,
			},
		});
		let capturedMaxOutputTokens: unknown;
		const model = createStreamModel(
			[
				[
					{ type: "stream-start", warnings: [] },
					{ id: "text-config", type: "text-start" },
					{ delta: "configured", id: "text-config", type: "text-delta" },
					{ id: "text-config", type: "text-end" },
					{
						finishReason: { raw: "stop", unified: "stop" },
						type: "finish",
						usage: {
							inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
							outputTokens: { reasoning: undefined, text: 1, total: 1 },
						},
					},
				],
			],
			(options) => {
				capturedMaxOutputTokens = options.maxOutputTokens;
			},
		);

		const loop = createAgentLoop({
			bus: context.bus,
			config: context.config,
			model,
			pipeline: context.pipeline,
			store: context.store,
		});
		const { result } = await loop.stream({
			message: "Test max output tokens",
			sessionId: "session-configured-max-output",
		});

		expect(await result.text).toBe("configured");
		expect(capturedMaxOutputTokens).toBe(2048);
	});

	test("recall injects only bounded relevant facts instead of dumping all active facts into context", async () => {
		const context = createTestContext();
		await context.store.insertFact({
			confidence: 0.95,
			created_by: "api",
			extraction_meta: undefined,
			key: "preferred_editor",
			schema_version: 1,
			source_event_id: undefined,
			status: "active",
			supersedes_fact_id: undefined,
			valid_from: undefined,
			valid_to: undefined,
			value: "neovim",
		});
		for (let index = 0; index < 12; index += 1) {
			await context.store.insertFact({
				confidence: 0.6,
				created_by: "api",
				extraction_meta: undefined,
				key: `irrelevant_fact_${index}`,
				schema_version: 1,
				source_event_id: undefined,
				status: "active",
				supersedes_fact_id: undefined,
				valid_from: undefined,
				valid_to: undefined,
				value: `value-${index}`,
			});
		}

		let capturedPrompt = "";
		const model = createStreamModel(
			[
				[
					{ type: "stream-start", warnings: [] },
					{ id: "text-4", type: "text-start" },
					{ delta: "Your preferred editor is neovim.", id: "text-4", type: "text-delta" },
					{ id: "text-4", type: "text-end" },
					{
						finishReason: { raw: "stop", unified: "stop" },
						type: "finish",
						usage: {
							inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
							outputTokens: { reasoning: undefined, text: 1, total: 1 },
						},
					},
				],
			],
			(options) => {
				capturedPrompt = JSON.stringify(options.prompt);
			},
		);

		const loop = createAgentLoop({
			bus: context.bus,
			config: context.config,
			model,
			pipeline: context.pipeline,
			store: context.store,
		});
		const { result } = await loop.stream({
			message: "What is my preferred editor?",
			sessionId: "session-recall-2",
		});

		expect(await result.text).toContain("neovim");
		expect(capturedPrompt).toContain("preferred_editor");
		expect(capturedPrompt).not.toContain("irrelevant_fact_11");
	});
});
