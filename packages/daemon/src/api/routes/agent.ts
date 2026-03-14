import type { Hono } from "hono";
import { z } from "zod";

import { createAgentLoop, NoLanguageModelConfiguredError } from "../../agent/loop";
import type { ApiContext } from "../context";
import { jsonError, parseJsonBody } from "../context";

const AgentRequestSchema = z.object({
	message: z.string().min(1),
	session_id: z.string().min(1).optional(),
});

const encoder = new TextEncoder();

function encodeEvent(payload: Record<string, unknown>): Uint8Array {
	return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function encodeHeartbeat(): Uint8Array {
	return encoder.encode(":\n\n");
}

export function registerAgentRoute(app: Hono, api: ApiContext): void {
	app.post("/agent", async (c) => {
		const parsed = await parseJsonBody(c, AgentRequestSchema);
		if (!parsed.success) {
			return parsed.response;
		}

		try {
			const loop = createAgentLoop({
				bus: api.bus,
				config: api.config,
				pipeline: api.pipeline,
				store: api.store,
			});
			const { result, sessionId } = await loop.stream({
				message: parsed.data.message,
				sessionId: parsed.data.session_id,
			});

			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encodeHeartbeat());
					const heartbeat = setInterval(() => {
						controller.enqueue(encodeHeartbeat());
					}, 15_000);

					const pump = async () => {
						try {
							for await (const chunk of result.textStream) {
								controller.enqueue(
									encodeEvent({
										text: chunk,
										type: "text-delta",
									}),
								);
							}

							controller.enqueue(
								encodeEvent({
									session_id: sessionId,
									type: "finish",
								}),
							);
						} catch (error) {
							controller.enqueue(
								encodeEvent({
									code: "AGENT_ERROR",
									error: error instanceof Error ? error.message : String(error),
									type: "error",
								}),
							);
						} finally {
							clearInterval(heartbeat);
							controller.close();
						}
					};

					void pump();
					c.req.raw.signal.addEventListener(
						"abort",
						() => {
							clearInterval(heartbeat);
							try {
								controller.close();
							} catch {
								// Ignore close races.
							}
						},
						{ once: true },
					);
				},
			});

			return new Response(stream, {
				headers: {
					"cache-control": "no-cache",
					connection: "keep-alive",
					"content-type": "text/event-stream",
				},
			});
		} catch (error) {
			if (error instanceof NoLanguageModelConfiguredError) {
				return jsonError(c, 503, "NO_API_KEY", "API key not configured");
			}

			throw error;
		}
	});
}
