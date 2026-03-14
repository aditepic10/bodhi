import type { EventSource, EventType, Fact, StoredEvent } from "@bodhi/types";

export interface RetrievalOverrides {
	after?: number;
	before?: number;
	eventTypes?: readonly EventType[];
	includeEvents?: boolean;
	includeFacts?: boolean;
	limit?: number;
	sources?: readonly EventSource[];
}

export interface RetrievalPlan {
	after?: number;
	before?: number;
	eventTypes: readonly EventType[];
	includeEvents: boolean;
	includeFacts: boolean;
	limit: number;
	query: string;
	sources: readonly EventSource[];
	terms: readonly string[];
}

export interface RetrievedContext {
	events: StoredEvent[];
	facts: Fact[];
	plan: RetrievalPlan;
}

export interface RetrievalPlanner {
	plan(question: string, overrides?: RetrievalOverrides): RetrievalPlan;
}
