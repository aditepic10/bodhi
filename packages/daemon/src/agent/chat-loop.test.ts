import { describe, expect, test } from "bun:test";
import type { LanguageModel } from "ai";

import { createTestContext } from "../test-utils";
import { createChatLoop } from "./chat-loop";

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
		modelId: "mock-chat-model",
		provider: "mock-chat-provider",
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

describe("chat loop workflows", () => {
	test("chat uses prior session history on later turns", async () => {
		const context = createTestContext();
		const capturedCalls: string[] = [];
		const model = createStreamModel(
			[
				[
					{ type: "stream-start", warnings: [] },
					{ id: "text-1", type: "text-start" },
					{ delta: "4", id: "text-1", type: "text-delta" },
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
				[
					{ type: "stream-start", warnings: [] },
					{ id: "text-2", type: "text-start" },
					{ delta: "8", id: "text-2", type: "text-delta" },
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
			],
			(options) => {
				capturedCalls.push(JSON.stringify(options));
			},
		);

		const loop = createChatLoop({
			bus: context.bus,
			config: context.config,
			model,
			pipeline: context.pipeline,
			store: context.store,
		});
		await context.store.upsertChatSession({
			cwd: "/work/bodhi",
			session_id: "session-1",
		});

		const first = await loop.stream({
			message: "what is 2+2?",
			sessionId: "session-1",
		});
		expect(await first.result.text).toBe("4");

		const second = await loop.stream({
			message: "what is your previous answer plus 4?",
			sessionId: "session-1",
		});
		expect(await second.result.text).toBe("8");

		expect(capturedCalls[1]).toContain("what is 2+2?");
		expect(capturedCalls[1]).toContain('"4"');
		expect(capturedCalls[1]).toContain("what is your previous answer plus 4?");
		expect((await context.store.getConversation("session-1")).map((entry) => entry.role)).toEqual([
			"user",
			"assistant",
			"user",
			"assistant",
		]);
	});

	test("chat persists tool turns alongside assistant text", async () => {
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

		const loop = createChatLoop({
			bus: context.bus,
			config: context.config,
			model,
			pipeline: context.pipeline,
			store: context.store,
		});
		await context.store.upsertChatSession({
			cwd: "/work/bodhi",
			session_id: "session-tools",
		});
		const { result } = await loop.stream({
			message: "Remember that I use zsh.",
			sessionId: "session-tools",
		});

		expect(await result.text).toContain("preferred shell is zsh");
		const conversation = await context.store.getConversation("session-tools");
		expect(conversation.map((entry) => entry.role)).toEqual([
			"user",
			"assistant",
			"tool",
			"assistant",
		]);
		expect(conversation[1]?.content_json).toContain("tool-call");
		expect(conversation[2]?.content_json).toContain("tool-result");
	});
});
