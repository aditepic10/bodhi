import type { BodhiConfig, Fact, Store } from "@bodhi/types";
import { tool } from "ai";
import { z } from "zod";
import type { EventBus } from "../bus";

export interface StoreFactToolOptions {
	bus: EventBus;
	config: BodhiConfig;
	store: Store;
}

const StoreFactInputSchema = z.object({
	key: z.string().min(1).describe("Stable fact key, such as preferred_editor."),
	value: z.string().min(1).describe("The fact value to store."),
	confidence: z.number().min(0).max(1).default(0.8),
	source_event_id: z.string().min(1).optional(),
});

export function createStoreFactTool(options: StoreFactToolOptions) {
	return tool({
		description: "Store a durable fact the assistant has learned about the user or environment.",
		inputSchema: StoreFactInputSchema,
		execute: async (input) => {
			const stored = await options.store.insertFact({
				confidence: input.confidence,
				created_by: "agent",
				extraction_meta: undefined,
				key: input.key,
				schema_version: 1,
				source_event_id: input.source_event_id,
				status: options.config.intel.auto_approve ? "active" : "pending",
				supersedes_fact_id: undefined,
				valid_from: undefined,
				valid_to: undefined,
				value: input.value,
			});
			options.bus.emit("fact:extracted", stored as Fact);
			return {
				id: stored.id,
				key: stored.key,
				status: stored.status,
				value: stored.value,
			};
		},
	});
}
