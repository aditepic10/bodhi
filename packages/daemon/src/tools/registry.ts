import type { BodhiConfig, Store } from "@bodhi/types";

import type { EventBus } from "../bus";
import type { PipelineLike } from "../store/sqlite";
import { createMemorySearchTool } from "./memory-search";
import { createStoreFactTool } from "./store-fact";

export interface AgentToolRegistryOptions {
	bus: EventBus;
	config: BodhiConfig;
	pipeline: PipelineLike;
	store: Store;
}

export function createAgentToolRegistry(options: AgentToolRegistryOptions) {
	return {
		"memory-search": createMemorySearchTool({
			pipeline: options.pipeline,
			store: options.store,
		}),
		"store-fact": createStoreFactTool({
			bus: options.bus,
			config: options.config,
			store: options.store,
		}),
	};
}
