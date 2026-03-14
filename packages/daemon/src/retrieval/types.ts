import type { EventSource, EventType, Fact, StoredEvent } from "@bodhi/types";

export interface RetrievalOverrides {
	after?: number;
	before?: number;
	branch?: string;
	cwd?: string;
	eventTypes?: readonly EventType[];
	includeEvents?: boolean;
	includeFacts?: boolean;
	limit?: number;
	repo?: string;
	sources?: readonly EventSource[];
	thread?: string;
	tool?: string;
}

export interface RetrievalPlan {
	after?: number;
	before?: number;
	branch?: string;
	cwd?: string;
	eventTypes: readonly EventType[];
	includeEvents: boolean;
	includeFacts: boolean;
	limit: number;
	query: string;
	repo?: string;
	sources: readonly EventSource[];
	thread?: string;
	terms: readonly string[];
	tool?: string;
}

export interface RetrievedContext {
	events: StoredEvent[];
	facts: Fact[];
	plan: RetrievalPlan;
}

export interface RetrievalPlanner {
	plan(question: string, overrides?: RetrievalOverrides): RetrievalPlan;
}
