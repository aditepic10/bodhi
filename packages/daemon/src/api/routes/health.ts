import type { Hono } from "hono";

import type { ApiContext } from "../context";
import { resolveIntelStatus } from "../context";

export function registerHealthRoute(app: Hono, api: ApiContext): void {
	app.get("/health", (c) => {
		let store: "healthy" | "error" = "healthy";
		try {
			api.store.db.query("SELECT 1").get();
		} catch {
			store = "error";
		}

		const intel = api.getIntelHealth();
		const diskFreeMb = api.getDiskFreeMb();
		const response = {
			ok: store === "healthy",
			uptime: (Date.now() - api.startedAt) / 1000,
			components: {
				store,
				intel: resolveIntelStatus(intel),
				queue: {
					depth: intel.queueDepth,
					max: intel.queueMax,
				},
				circuit_breaker: intel.circuitBreaker,
				spool_files: api.getSpoolFileCount(),
				disk_free_mb: diskFreeMb,
			},
		};

		return c.json(response, response.ok ? 200 : 503);
	});
}
