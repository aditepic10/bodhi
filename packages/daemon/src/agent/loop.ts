import type { BodhiConfig, Store } from "@bodhi/types";
import { type LanguageModel, type StreamTextResult, stepCountIs, streamText } from "ai";
import { nanoid } from "nanoid";

import type { EventBus } from "../bus";
import type { PipelineLike } from "../store/sqlite";
import { createAgentToolRegistry } from "../tools/registry";
import { resolveLanguageModel } from "./providers";
import { buildSystemPrompt } from "./system-prompt";

export class NoLanguageModelConfiguredError extends Error {
	constructor() {
		super("API key not configured");
		this.name = "NoLanguageModelConfiguredError";
	}
}

export interface AgentLoopOptions {
	bus: EventBus;
	config: BodhiConfig;
	model?: LanguageModel | null;
	pipeline: PipelineLike;
	store: Store;
}

export interface AgentLoopRequest {
	message: string;
	sessionId?: string;
}

export interface AgentLoopResult {
	result: StreamTextResult<ReturnType<typeof createAgentToolRegistry>, never>;
	sessionId: string;
}

export function createAgentLoop(options: AgentLoopOptions) {
	return {
		async stream(request: AgentLoopRequest): Promise<AgentLoopResult> {
			const model = options.model ?? resolveLanguageModel(options.config);
			if (!model) {
				throw new NoLanguageModelConfiguredError();
			}

			const sessionId = request.sessionId ?? nanoid();
			const facts = await options.store.getFacts({
				active_only: true,
				limit: 100,
				status: "active",
			});
			const tools = createAgentToolRegistry({
				bus: options.bus,
				config: options.config,
				pipeline: options.pipeline,
				store: options.store,
			});

			await options.store.appendMessage("user", request.message, sessionId);

			const result = streamText({
				maxOutputTokens: 800,
				model,
				onFinish: async ({ text }) => {
					await options.store.appendMessage("assistant", text, sessionId);
				},
				prompt: request.message,
				stopWhen: stepCountIs(10),
				system: buildSystemPrompt(facts),
				tools,
			});

			return {
				result,
				sessionId,
			};
		},
	};
}
