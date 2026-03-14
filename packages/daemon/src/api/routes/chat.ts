import type { Hono } from "hono";
import { z } from "zod";

import { ChatSessionNotFoundError, createChatLoop } from "../../agent/chat-loop";
import { NoLanguageModelConfiguredError } from "../../agent/loop";
import type { ApiContext } from "../context";
import { jsonError, parseJsonBody } from "../context";

const ChatRequestSchema = z.object({
	cwd: z.string().min(1).optional(),
	message: z.string().min(1),
	session_id: z.string().min(1),
});

export function registerChatRoute(app: Hono, api: ApiContext): void {
	app.post("/chat", async (c) => {
		const parsed = await parseJsonBody(c, ChatRequestSchema);
		if (!parsed.success) {
			return parsed.response;
		}

		try {
			const loop = createChatLoop({
				bus: api.bus,
				config: api.config,
				pipeline: api.pipeline,
				store: api.store,
			});
			const { result } = await loop.stream({
				cwd: parsed.data.cwd,
				message: parsed.data.message,
				sessionId: parsed.data.session_id,
			});

			return result.toUIMessageStreamResponse({
				onError: (error) => (error instanceof Error ? error.message : String(error)),
				sendReasoning: false,
				sendSources: false,
			});
		} catch (error) {
			if (error instanceof NoLanguageModelConfiguredError) {
				return jsonError(c, 503, "NO_API_KEY", "API key not configured");
			}
			if (error instanceof ChatSessionNotFoundError) {
				return jsonError(c, 404, "SESSION_NOT_FOUND", error.message);
			}

			throw error;
		}
	});
}
