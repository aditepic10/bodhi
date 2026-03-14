import type { Store } from "@bodhi/types";
import { tool } from "ai";
import { z } from "zod";
import { redactSensitiveString } from "../pipeline/transforms/redact";
import type { PipelineLike } from "../store/sqlite";
import { redactForEgress } from "../store/sqlite";

export interface MemorySearchToolOptions {
	store: Store;
	pipeline: PipelineLike;
}

const MemorySearchInputSchema = z.object({
	query: z.string().min(1).describe("Search term to look up in stored memory."),
	limit: z.number().int().min(1).max(20).default(5),
});

export function createMemorySearchTool(options: MemorySearchToolOptions) {
	return tool({
		description: "Search stored events and active facts relevant to the current question.",
		inputSchema: MemorySearchInputSchema,
		execute: async ({ limit, query }) => {
			const [events, facts] = await Promise.all([
				options.store.searchEvents(query, limit),
				options.store.searchFacts(query, limit),
			]);

			return {
				events: redactForEgress(events, options.pipeline).map((event) => ({
					created_at: event.created_at,
					event_id: event.event_id,
					metadata: event.metadata,
					source: event.source,
					type: event.type,
				})),
				facts: facts.map((fact) => ({
					confidence: fact.confidence,
					key: fact.key,
					value: redactSensitiveString(fact.value),
				})),
			};
		},
	});
}
