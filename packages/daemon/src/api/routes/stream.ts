import { TextEncoder } from "node:util";
import type { Hono } from "hono";

import type { ApiContext } from "../context";

const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();

function encodeSseEvent(event: string, payload: unknown): Uint8Array {
	return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function encodeHeartbeat(): Uint8Array {
	return encoder.encode(":\n\n");
}

export function registerStreamRoute(app: Hono, api: ApiContext): void {
	app.get("/stream", (c) => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeHeartbeat());

				const unsubscribe = api.bus.on("*", ({ type, payload }) => {
					controller.enqueue(encodeSseEvent(type, payload));
				});

				const heartbeat = setInterval(() => {
					controller.enqueue(encodeHeartbeat());
				}, HEARTBEAT_MS);

				const cleanup = () => {
					clearInterval(heartbeat);
					unsubscribe();
					try {
						controller.close();
					} catch {
						// Ignore close races from abort/cancel.
					}
				};

				c.req.raw.signal.addEventListener("abort", cleanup, { once: true });
			},
		});

		return new Response(stream, {
			headers: {
				"cache-control": "no-cache",
				connection: "keep-alive",
				"content-type": "text/event-stream",
			},
		});
	});
}
