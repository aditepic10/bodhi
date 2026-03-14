import type { Store, StoredEvent } from "@bodhi/types";

import { searchEventsWithFts } from "./fts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface QueryOptions {
	limit?: number;
}

export interface QueryEngine {
	search(query: string, options?: QueryOptions): Promise<StoredEvent[]>;
}

function normalizeLimit(limit?: number): number {
	return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

export function createQueryEngine(store: Store): QueryEngine {
	return {
		async search(query, options = {}) {
			const term = query.trim();
			if (term.length === 0) {
				return [];
			}

			return searchEventsWithFts(store, term, {
				limit: normalizeLimit(options.limit),
			});
		},
	};
}
