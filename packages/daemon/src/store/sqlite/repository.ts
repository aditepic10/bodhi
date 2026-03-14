import type { Database } from "bun:sqlite";

import { createConversationStore } from "./conversation-store";
import { createEventStore } from "./event-store";
import { createFactStore } from "./fact-store";
import type { CreateStoreOptions, SqliteStore } from "./types";

export function createStore(db: Database, options: CreateStoreOptions = {}): SqliteStore {
	const autoApprove = options.autoApprove ?? true;

	return {
		db,
		...createEventStore(db),
		...createFactStore(db, autoApprove),
		...createConversationStore(db),
		close() {
			db.close();
		},
	};
}
