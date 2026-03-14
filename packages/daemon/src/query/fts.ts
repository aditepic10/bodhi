import type { Store, StoredEvent } from "@bodhi/types";

export interface FtsSearchOptions {
	limit?: number;
}

export async function searchEventsWithFts(
	store: Store,
	query: string,
	options: FtsSearchOptions = {},
): Promise<StoredEvent[]> {
	return store.searchEvents(query, options.limit);
}
