import type { Hono } from "hono";
import { z } from "zod";

import type { ApiContext } from "../context";
import { parseJsonBody } from "../context";

const FactQuerySchema = z.object({
	key: z.string().min(1).optional(),
	status: z.enum(["active", "pending", "rejected"]).optional(),
	limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const FactCreateSchema = z.object({
	key: z.string().min(1),
	value: z.string().min(1),
	confidence: z.number().min(0).max(1).default(1),
	source_event_id: z.string().min(1).optional(),
	schema_version: z.number().int().positive().default(1),
	supersedes_fact_id: z.string().min(1).optional(),
	extraction_meta: z.string().min(1).optional(),
	valid_from: z.number().int().optional(),
	valid_to: z.number().int().optional(),
});

export function registerFactsRoute(app: Hono, api: ApiContext): void {
	app.get("/facts", async (c) => {
		const parsed = FactQuerySchema.safeParse(c.req.query());
		const query = parsed.success ? parsed.data : {};
		const facts = await api.store.getFacts({
			key: query.key,
			status: query.status ?? "active",
			limit: query.limit,
		});
		return c.json({ facts }, 200);
	});

	app.post("/facts", async (c) => {
		const parsed = await parseJsonBody(c, FactCreateSchema);
		if (!parsed.success) {
			return parsed.response;
		}

		const fact = await api.store.insertFact({
			...parsed.data,
			created_by: "api",
			status: "active",
		});
		return c.json(fact, 201);
	});
}
