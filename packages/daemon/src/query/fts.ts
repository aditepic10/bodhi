import type { EventFilter, Store, StoredEvent } from "@bodhi/types";

export interface FtsSearchOptions {
	filter?: EventFilter;
	limit?: number;
}

export async function searchEventsWithFts(
	store: Store,
	query: string,
	options: FtsSearchOptions = {},
): Promise<StoredEvent[]> {
	return store.searchEvents(query, {
		...options.filter,
		limit: options.limit ?? options.filter?.limit,
	});
}
