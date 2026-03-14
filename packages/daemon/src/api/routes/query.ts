import type { Hono } from "hono";
import { z } from "zod";

import { createQueryEngine } from "../../query/engine";
import type { ApiContext } from "../context";
import { parseJsonBody } from "../context";

const QueryRequestSchema = z.object({
	query: z.string().min(1),
	limit: z.number().int().min(1).max(100).optional(),
});

export function registerQueryRoute(app: Hono, api: ApiContext): void {
	const engine = createQueryEngine(api.store);

	app.post("/query", async (c) => {
		const parsed = await parseJsonBody(c, QueryRequestSchema);
		if (!parsed.success) {
			return parsed.response;
		}

		const results = await engine.search(parsed.data.query, {
			limit: parsed.data.limit,
		});
		return c.json({ results }, 200);
	});
}
