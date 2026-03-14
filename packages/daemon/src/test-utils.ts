import type { BodhiConfig, BodhiEvent, Fact, PipelineConfig } from "@bodhi/types";
import { BodhiConfigSchema } from "@bodhi/types";

import { type BusEventMap, createEventBus, type EventBus } from "./bus";
import { createLogger } from "./logger";
import { createPipeline, type Pipeline } from "./pipeline/pipeline";
import {
	applyPragmas,
	createStore,
	ensureCoreSchema,
	openDatabase,
	type SqliteStore,
	setupFts,
} from "./store/sqlite";

export interface TestContext {
	config: BodhiConfig;
	store: SqliteStore;
	pipeline: Pipeline;
	bus: EventBus;
}

export function createTestStore(config?: Partial<BodhiConfig>): SqliteStore {
	const resolved = BodhiConfigSchema.parse(config ?? {});
	const db = openDatabase(":memory:");
	applyPragmas(db);
	ensureCoreSchema(db);
	setupFts(db);
	return createStore(db, {
		autoApprove: resolved.intel.auto_approve,
	});
}

export function createTestPipeline(config?: Partial<PipelineConfig>): Pipeline {
	return createPipeline({
		config,
		enrich: {
			machineId: "test-machine",
		},
	});
}

export function createTestBus(): EventBus {
	return createEventBus(createLogger("error"));
}

export function createTestContext(overrides?: Partial<BodhiConfig>): TestContext {
	const config = BodhiConfigSchema.parse(overrides ?? {});
	return {
		config,
		store: createTestStore(config),
		pipeline: createTestPipeline(config.pipeline),
		bus: createTestBus(),
	};
}

export function stubLLMResponse(response: string): void {
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
	type StubGenerateResult = {
		content: Array<{ text: string; type: "text" }>;
		finishReason: { raw: string; unified: "stop" };
		usage: StubUsage;
		warnings: [];
	};
	type StubStreamPart =
		| { type: "stream-start"; warnings: [] }
		| { id: string; type: "text-start" }
		| { delta: string; id: string; type: "text-delta" }
		| { id: string; type: "text-end" }
		| { finishReason: { raw: string; unified: "stop" }; type: "finish"; usage: StubUsage };
	type StubV3Model = {
		doGenerate(_options: unknown): Promise<StubGenerateResult>;
		doStream(_options: unknown): Promise<{ stream: ReadableStream<StubStreamPart> }>;
		modelId: string;
		provider: string;
		specificationVersion: "v3";
		supportedUrls: Record<string, never>;
	};

	const model = {
		modelId: "stubbed-model",
		provider: "stubbed-provider",
		specificationVersion: "v3",
		supportedUrls: {},
		async doGenerate(_options: unknown): Promise<StubGenerateResult> {
			return {
				content: [{ text: response, type: "text" }],
				finishReason: { raw: "stop", unified: "stop" },
				usage: {
					inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
					outputTokens: { reasoning: undefined, text: 1, total: 1 },
				},
				warnings: [],
			};
		},
		async doStream(_options: unknown): Promise<{ stream: ReadableStream<StubStreamPart> }> {
			const parts: StubStreamPart[] = [
				{ type: "stream-start", warnings: [] },
				{ id: "text-1", type: "text-start" },
				{ delta: response, id: "text-1", type: "text-delta" },
				{ id: "text-1", type: "text-end" },
				{
					finishReason: { raw: "stop", unified: "stop" },
					type: "finish",
					usage: {
						inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 1, total: 1 },
						outputTokens: { reasoning: undefined, text: 1, total: 1 },
					},
				},
			];
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
	globalThis.__bodhiStubLanguageModel = model;
}

export function resetLLMStubs(): void {
	Reflect.deleteProperty(globalThis, "__bodhiStubLanguageModel");
}

export function makeEvent(overrides: Partial<BodhiEvent> = {}): BodhiEvent {
	const base: BodhiEvent = {
		event_id: "evt-test-1",
		type: "shell.command.executed",
		metadata: {
			command: "echo hello",
			exit_code: 0,
			duration_ms: 12,
			cwd: "/tmp",
		},
		schema_version: 1,
		created_at: 1_700_000_000,
	};

	return {
		...base,
		...overrides,
		metadata: {
			...base.metadata,
			...(overrides as BodhiEvent).metadata,
		},
	} as BodhiEvent;
}

export function makeFact(
	overrides: Partial<Fact> = {},
): Omit<Fact, "id" | "created_at" | "updated_at"> {
	return {
		key: "editor",
		value: "vim",
		created_by: "intel",
		source_event_id: undefined,
		status: "active",
		confidence: 0.9,
		schema_version: 1,
		supersedes_fact_id: undefined,
		extraction_meta: undefined,
		valid_from: undefined,
		valid_to: undefined,
		...overrides,
	};
}

export function waitForEvent<K extends keyof BusEventMap>(
	bus: EventBus,
	type: K,
	timeout = 1000,
): Promise<BusEventMap[K]> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			unsubscribe();
			reject(new Error(`timed out waiting for ${type}`));
		}, timeout);

		const unsubscribe = bus.on(type, (payload) => {
			clearTimeout(timer);
			unsubscribe();
			resolve(payload);
		});
	});
}
