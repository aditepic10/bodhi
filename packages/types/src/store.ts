import type { ConversationMessage, Fact, FactCreatedBy, FactStatus, StoredEvent } from "./entities";
import type { BodhiEvent, EventType } from "./events";

export interface EventFilter {
	type?: EventType;
	source?: StoredEvent["source"];
	after?: number;
	before?: number;
	limit?: number;
}

export interface FactFilter {
	key?: string;
	created_by?: FactCreatedBy;
	status?: FactStatus;
	active_only?: boolean;
	limit?: number;
}

export interface Store {
	appendEvent(event: BodhiEvent, source: StoredEvent["source"]): Promise<StoredEvent>;
	getEvents(filter?: EventFilter): Promise<StoredEvent[]>;
	searchEvents(query: string, limit?: number): Promise<StoredEvent[]>;
	getUnprocessedEvents(limit?: number): Promise<StoredEvent[]>;
	markStarted(id: string): Promise<void>;
	markProcessed(id: string): Promise<void>;

	insertFact(fact: Omit<Fact, "id" | "created_at" | "updated_at">): Promise<Fact>;
	updateFact(id: string, updates: Partial<Fact>): Promise<Fact>;
	getFacts(filter?: FactFilter): Promise<Fact[]>;
	searchFacts(query: string, limit?: number): Promise<Fact[]>;
	invalidateFact(id: string): Promise<void>;

	appendMessage(
		role: "user" | "assistant" | "system",
		content: string,
		session_id: string,
	): Promise<string>;
	getConversation(session_id: string): Promise<ConversationMessage[]>;
	pruneConversations(maxSessions: number): Promise<number>;

	close(): void;
}
