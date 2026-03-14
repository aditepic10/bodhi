import type { StreamTextResult } from "ai";
import { stepCountIs, streamText } from "ai";
import { deriveWorkspaceContext } from "../activity-context";
import { createRetrievalService } from "../retrieval/service";
import { createAgentToolRegistry } from "../tools/registry";
import { conversationToModelMessages, persistResponseMessages } from "./chat-history";
import type { AgentLoopOptions } from "./loop";
import { NoLanguageModelConfiguredError } from "./loop";
import { resolveLanguageModel } from "./providers";
import { buildSystemPrompt } from "./system-prompt";

export interface ChatLoopRequest {
	cwd?: string;
	message: string;
	sessionId: string;
}

export interface ChatLoopResult {
	result: StreamTextResult<ReturnType<typeof createAgentToolRegistry>, never>;
	sessionId: string;
}

export class ChatSessionNotFoundError extends Error {
	constructor(sessionId: string) {
		super(`chat session not found: ${sessionId}`);
		this.name = "ChatSessionNotFoundError";
	}
}

export function createChatLoop(options: AgentLoopOptions) {
	const retrieval = options.retrieval ?? createRetrievalService({ store: options.store });

	return {
		async stream(request: ChatLoopRequest): Promise<ChatLoopResult> {
			const model = options.model ?? resolveLanguageModel(options.config);
			if (!model) {
				throw new NoLanguageModelConfiguredError();
			}

			const sessionId = request.sessionId;
			const existingSession = await options.store.getChatSession(sessionId);
			if (!existingSession) {
				throw new ChatSessionNotFoundError(sessionId);
			}
			const workspace = deriveWorkspaceContext(request.cwd);
			await options.store.upsertChatSession({
				branch: workspace.branch,
				cwd: workspace.cwd,
				repo_id: workspace.repo_id,
				session_id: sessionId,
				worktree_root: workspace.worktree_root,
			});
			await options.store.appendMessage("user", request.message, sessionId, {
				status: "complete",
			});
			const history = conversationToModelMessages(await options.store.getConversation(sessionId));
			const context = await retrieval.retrieve(request.message);
			const tools = createAgentToolRegistry({
				bus: options.bus,
				config: options.config,
				pipeline: options.pipeline,
				retrieval,
				store: options.store,
			});

			let partialText = "";
			const result = streamText({
				maxOutputTokens: options.config.agent.max_output_tokens,
				messages: history,
				model,
				onAbort: async () => {
					if (partialText.length === 0) {
						return;
					}
					await options.store.appendMessage("assistant", partialText, sessionId, {
						status: "interrupted",
					});
				},
				onChunk: async ({ chunk }) => {
					if (chunk.type === "text-delta") {
						partialText += chunk.text;
					}
				},
				onError: async ({ error }) => {
					await options.store.appendMessage(
						"assistant",
						partialText.length > 0
							? partialText
							: error instanceof Error
								? error.message
								: String(error),
						sessionId,
						{
							status: "error",
						},
					);
				},
				onFinish: async ({ response }) => {
					await persistResponseMessages(options.store, sessionId, response.messages);
				},
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
