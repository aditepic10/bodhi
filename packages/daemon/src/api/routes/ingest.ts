import { IngestEventSchema } from "@bodhi/types";
import type { Hono } from "hono";

import { sourceForEvent } from "../../store/sqlite";
import type { ApiContext } from "../context";
import { jsonError, parseJsonBody } from "../context";

export function registerIngestRoute(app: Hono, api: ApiContext): void {
	app.post("/events", async (c) => {
		if (api.isCapturePaused()) {
			return jsonError(c, 507, "CAPTURE_PAUSED", "event capture is paused");
		}

		const parsed = await parseJsonBody(c, IngestEventSchema);
		if (!parsed.success) {
			return parsed.response;
		}

		const transformed = api.pipeline.process(parsed.data);
		if (!transformed) {
			api.log.warn("event rejected by pipeline", {
				event_id: parsed.data.event_id,
				type: parsed.data.type,
			});
			return jsonError(c, 400, "EVENT_REJECTED", "event rejected by pipeline");
		}

		const stored = await api.store.appendEvent(transformed, sourceForEvent(transformed));
		api.bus.emit(transformed.type, transformed);
		api.bus.emit("event:stored", stored);
		api.log.info("event ingested", {
			event_id: stored.event_id,
			id: stored.id,
			type: stored.type,
		});

		return c.json({ id: stored.id }, 200);
	});
}
