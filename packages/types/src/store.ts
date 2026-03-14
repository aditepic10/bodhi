import type {
	ChatSession,
	ChatSessionListEntry,
	ConversationMessage,
	ConversationStatus,
	Fact,
	FactCreatedBy,
	FactStatus,
	StoredEvent,
} from "./entities";
import type { BodhiEvent, EventType } from "./events";

export interface EventFilter {
	type?: EventType;
	source?: StoredEvent["source"];
	repo?: string;
	branch?: string;
	tool?: string;
	thread?: string;
	cwd?: string;
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

export interface ChatSessionSeed {
	session_id: string;
	repo_id?: string;
	worktree_root?: string;
	cwd?: string;
	branch?: string;
}

export interface ChatSessionListFilter {
	repo_id?: string;
	worktree_root?: string;
	cwd?: string;
	limit?: number;
}

export interface Store {
	appendEvent(event: BodhiEvent, source: StoredEvent["source"]): Promise<StoredEvent>;
	getEvents(filter?: EventFilter): Promise<StoredEvent[]>;
	searchEvents(query: string, filter?: EventFilter): Promise<StoredEvent[]>;
	getUnprocessedEvents(limit?: number): Promise<StoredEvent[]>;
	markStarted(id: string): Promise<void>;
	markProcessed(id: string): Promise<void>;

	insertFact(fact: Omit<Fact, "id" | "created_at" | "updated_at">): Promise<Fact>;
	updateFact(id: string, updates: Partial<Fact>): Promise<Fact>;
	getFacts(filter?: FactFilter): Promise<Fact[]>;
	searchFacts(query: string, limit?: number): Promise<Fact[]>;
	invalidateFact(id: string): Promise<void>;

	appendMessage(
		role: "user" | "assistant" | "system" | "tool",
		content: string,
		session_id: string,
		options?: {
			content_json?: string;
			status?: ConversationStatus;
		},
	): Promise<string>;
	upsertChatSession(session: ChatSessionSeed): Promise<ChatSession>;
	getChatSession(session_id: string): Promise<ChatSession | null>;
	listChatSessions(filter?: ChatSessionListFilter): Promise<ChatSessionListEntry[]>;
	getConversation(session_id: string): Promise<ConversationMessage[]>;
	pruneChatSessions(maxSessions: number): Promise<number>;

	close(): void;
}
