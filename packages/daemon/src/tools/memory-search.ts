import { EventTypeSchema } from "@bodhi/types";
import { tool } from "ai";
import { z } from "zod";
import { redactSensitiveString } from "../pipeline/transforms/redact";
import type { RetrievalService } from "../retrieval/service";
import type { PipelineLike } from "../store/sqlite";
import { redactForEgress } from "../store/sqlite";

export interface MemorySearchToolOptions {
	pipeline: PipelineLike;
	retrieval: RetrievalService;
}

const MemorySearchInputSchema = z.object({
	after: z.number().int().optional(),
	before: z.number().int().optional(),
	eventTypes: z.array(EventTypeSchema).max(6).optional(),
	query: z.string().min(1).describe("Search term to look up in stored memory."),
	limit: z.number().int().min(1).max(20).default(5),
});

export function createMemorySearchTool(options: MemorySearchToolOptions) {
	return tool({
		description: "Retrieve relevant stored events and facts using bounded structured filters.",
		inputSchema: MemorySearchInputSchema,
		execute: async ({ after, before, eventTypes, limit, query }) => {
			const { events, facts } = await options.retrieval.retrieve(query, {
				after,
				before,
				eventTypes,
				limit,
			});

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
