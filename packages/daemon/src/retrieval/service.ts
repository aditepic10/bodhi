import type { EventType, Fact, Store, StoredEvent } from "@bodhi/types";

import { createRetrievalPlanner } from "./planner";
import type { RetrievalOverrides, RetrievalPlanner, RetrievedContext } from "./types";

export interface RetrievalServiceOptions {
	planner?: RetrievalPlanner;
	store: Store;
}

export interface RetrievalService {
	retrieve(question: string, overrides?: RetrievalOverrides): Promise<RetrievedContext>;
}

interface RankedEvent {
	event: StoredEvent;
	score: number;
}

function matchesEventFilters(
	event: StoredEvent,
	overrides: {
		after?: number;
		before?: number;
		eventTypes: readonly EventType[];
	},
): boolean {
	if (overrides.after && event.created_at < overrides.after) {
		return false;
	}
	if (overrides.before && event.created_at > overrides.before) {
		return false;
	}
	if (overrides.eventTypes.length > 0 && !overrides.eventTypes.includes(event.type)) {
		return false;
	}
	return true;
}

async function getRecentEventsByType(
	store: Store,
	eventTypes: readonly EventType[],
	limit: number,
	overrides: {
		after?: number;
		before?: number;
	},
): Promise<StoredEvent[]> {
	const batches = await Promise.all(
		eventTypes.map((eventType) =>
			store.getEvents({
				after: overrides.after,
				before: overrides.before,
				limit,
				type: eventType,
			}),
		),
	);

	return batches.flat();
}

function rankEvents(events: RankedEvent[], limit: number): StoredEvent[] {
	return [...events]
		.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}
			return right.event.created_at - left.event.created_at;
		})
		.slice(0, limit)
		.map((entry) => entry.event);
}

function dedupeRankedEvents(entries: RankedEvent[]): RankedEvent[] {
	const ranked = new Map<string, RankedEvent>();
	for (const entry of entries) {
		const existing = ranked.get(entry.event.event_id);
		if (!existing || entry.score > existing.score) {
			ranked.set(entry.event.event_id, entry);
		}
	}
	return [...ranked.values()];
}

function rankFact(fact: Fact): number {
	return fact.confidence * 100 + fact.created_at;
}

export function createRetrievalService(options: RetrievalServiceOptions): RetrievalService {
	const planner = options.planner ?? createRetrievalPlanner();

	return {
		async retrieve(question, overrides = {}) {
			const plan = planner.plan(question, overrides);

			const rankedEvents: RankedEvent[] = [];
			if (plan.includeEvents) {
				if (plan.query.length > 0) {
					const textMatches = await options.store.searchEvents(plan.query, plan.limit * 3);
					for (const event of textMatches) {
						if (!matchesEventFilters(event, plan)) {
							continue;
						}
						rankedEvents.push({
							event,
							score: 100,
						});
					}
				}

				if (plan.eventTypes.length > 0) {
					const recentMatches = await getRecentEventsByType(
						options.store,
						plan.eventTypes,
						plan.limit,
						{
							after: plan.after,
							before: plan.before,
						},
					);
					for (const event of recentMatches) {
						if (!matchesEventFilters(event, plan)) {
							continue;
						}
						rankedEvents.push({
							event,
							score: 50,
						});
					}
				}
			}

			const facts =
				plan.includeFacts && plan.query.length > 0
					? (await options.store.searchFacts(plan.query, plan.limit * 2))
							.filter((fact) => fact.status === "active" && fact.valid_to == null)
							.sort((left, right) => rankFact(right) - rankFact(left))
							.slice(0, plan.limit)
					: [];

			return {
				events: rankEvents(dedupeRankedEvents(rankedEvents), plan.limit),
				facts,
				plan,
			};
		},
	};
}
