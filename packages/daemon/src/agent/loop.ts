import type { BodhiConfig, Store } from "@bodhi/types";
import { type LanguageModel, type StreamTextResult, stepCountIs, streamText } from "ai";
import { nanoid } from "nanoid";

import { deriveWorkspaceContext } from "../activity-context";
import type { EventBus } from "../bus";
import { createRetrievalService, type RetrievalService } from "../retrieval/service";
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
	retrieval?: RetrievalService;
	store: Store;
}

export interface AgentLoopRequest {
	cwd?: string;
	message: string;
	sessionId?: string;
}

export interface AgentLoopResult {
	result: StreamTextResult<ReturnType<typeof createAgentToolRegistry>, never>;
	sessionId: string;
}

export function createAgentLoop(options: AgentLoopOptions) {
	const retrieval = options.retrieval ?? createRetrievalService({ store: options.store });

	return {
		async stream(request: AgentLoopRequest): Promise<AgentLoopResult> {
			const model = options.model ?? resolveLanguageModel(options.config);
			if (!model) {
				throw new NoLanguageModelConfiguredError();
			}

			const sessionId = request.sessionId ?? nanoid();
			const workspace = deriveWorkspaceContext(request.cwd);
			await options.store.upsertChatSession({
				branch: workspace.branch,
				cwd: workspace.cwd,
				repo_id: workspace.repo_id,
				session_id: sessionId,
				worktree_root: workspace.worktree_root,
			});
			const context = await retrieval.retrieve(request.message);
			const tools = createAgentToolRegistry({
				bus: options.bus,
				config: options.config,
				pipeline: options.pipeline,
				retrieval,
				store: options.store,
			});

			await options.store.appendMessage("user", request.message, sessionId);

			const result = streamText({
				maxOutputTokens: options.config.agent.max_output_tokens,
				model,
				onFinish: async ({ text }) => {
					await options.store.appendMessage("assistant", text, sessionId);
				},
				prompt: request.message,
				stopWhen: stepCountIs(10),
				system: buildSystemPrompt(context),
				tools,
			});

			return {
				result,
				sessionId,
			};
		},
	};
}
