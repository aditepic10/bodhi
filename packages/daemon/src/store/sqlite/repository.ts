import type { Database } from "bun:sqlite";

import { createChatStore } from "./chat-store";
import { createEventStore } from "./event-store";
import { createFactStore } from "./fact-store";
import type { CreateStoreOptions, SqliteStore } from "./types";

export function createStore(db: Database, options: CreateStoreOptions = {}): SqliteStore {
	const autoApprove = options.autoApprove ?? true;

	return {
		db,
		...createEventStore(db),
		...createFactStore(db, autoApprove),
		...createChatStore(db),
		close() {
			db.close();
		},
	};
}
