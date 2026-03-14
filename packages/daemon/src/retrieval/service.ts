import type { EventFilter, EventType, Fact, Store, StoredEvent } from "@bodhi/types";

import { createRetrievalPlanner } from "./planner";
import {
	type EventCandidate,
	type FactCandidate,
	rankEventCandidate,
	rankFactCandidate,
} from "./ranking";
import type { RetrievalOverrides, RetrievalPlanner, RetrievedContext } from "./types";

export interface RetrievalServiceOptions {
	now?: () => number;
	planner?: RetrievalPlanner;
	store: Store;
}

export interface RetrievalService {
	retrieve(question: string, overrides?: RetrievalOverrides): Promise<RetrievedContext>;
}

type SharedFilter = Pick<
	RetrievalOverrides,
	"after" | "before" | "branch" | "cwd" | "repo" | "thread" | "tool"
>;

function buildEventFilter(
	plan: SharedFilter & {
		eventType?: EventType;
		source?: StoredEvent["source"];
		limit: number;
	},
): EventFilter {
	return {
		after: plan.after,
		before: plan.before,
		branch: plan.branch,
		cwd: plan.cwd,
		limit: plan.limit,
		repo: plan.repo,
		source: plan.source,
		thread: plan.thread,
		tool: plan.tool,
		type: plan.eventType,
	};
}

async function getRecentEvents(
	store: Store,
	limit: number,
	overrides: SharedFilter,
	eventTypes: readonly EventType[],
): Promise<StoredEvent[]> {
	if (eventTypes.length === 0) {
		return store.getEvents(buildEventFilter({ ...overrides, limit }));
	}

	const batches = await Promise.all(
		eventTypes.map((eventType) =>
			store.getEvents(buildEventFilter({ ...overrides, eventType, limit })),
		),
	);

	return batches
		.flat()
		.sort((left, right) => right.created_at - left.created_at)
		.slice(0, limit);
}

function createEventCandidateMap(): Map<string, EventCandidate> {
	return new Map<string, EventCandidate>();
}

function addTextCandidates(
	candidates: Map<string, EventCandidate>,
	events: readonly StoredEvent[],
): void {
	events.forEach((event, index) => {
		const existing = candidates.get(event.event_id);
		if (existing) {
			existing.ftsRank = Math.min(existing.ftsRank ?? index, index);
			return;
		}
		candidates.set(event.event_id, {
			event,
			ftsRank: index,
		});
	});
}

function addRecentCandidates(
	candidates: Map<string, EventCandidate>,
	events: readonly StoredEvent[],
): void {
	events.forEach((event, index) => {
		const existing = candidates.get(event.event_id);
		if (existing) {
			existing.recentRank = Math.min(existing.recentRank ?? index, index);
			return;
		}
		candidates.set(event.event_id, {
			event,
			recentRank: index,
		});
	});
}

function rankEvents(
	candidates: readonly EventCandidate[],
	limit: number,
	questionNow: number,
	sources: RetrievedContext["plan"]["sources"],
	terms: readonly string[],
	intents: RetrievedContext["plan"]["intents"],
): StoredEvent[] {
	const maxFtsRank = Math.max(...candidates.map((candidate) => candidate.ftsRank ?? 0), 1);
	const maxRecentRank = Math.max(...candidates.map((candidate) => candidate.recentRank ?? 0), 1);

	return [...candidates]
		.sort((left, right) => {
			const leftScore = rankEventCandidate(left, {
				intents,
				maxFtsRank,
				maxRecentRank,
				now: questionNow,
				sources,
				terms,
			});
			const rightScore = rankEventCandidate(right, {
				intents,
				maxFtsRank,
				maxRecentRank,
				now: questionNow,
				sources,
				terms,
			});
			if (rightScore !== leftScore) {
				return rightScore - leftScore;
			}
			return right.event.created_at - left.event.created_at;
		})
		.slice(0, limit)
		.map((candidate) => candidate.event);
}

function rankFacts(
	facts: readonly Fact[],
	intents: RetrievedContext["plan"]["intents"],
	limit: number,
	now: number,
): Fact[] {
	const candidates: FactCandidate[] = facts.map((fact, index) => ({
		fact,
		searchRank: index,
	}));

	return [...candidates]
		.sort((left, right) => {
			const leftScore = rankFactCandidate(left, intents, now);
			const rightScore = rankFactCandidate(right, intents, now);
			if (rightScore !== leftScore) {
				return rightScore - leftScore;
			}
			return right.fact.created_at - left.fact.created_at;
		})
		.slice(0, limit)
		.map((candidate) => candidate.fact);
}

export function createRetrievalService(options: RetrievalServiceOptions): RetrievalService {
	const planner = options.planner ?? createRetrievalPlanner();
	const now = options.now ?? (() => Math.floor(Date.now() / 1000));

	return {
		async retrieve(question, overrides = {}) {
			const plan = planner.plan(question, overrides);
			const candidateLimit = Math.max(plan.limit * 4, 12);
			const currentTime = now();

			const eventCandidates = createEventCandidateMap();
			if (plan.includeEvents) {
				if (plan.query.length > 0) {
					const textMatches = await options.store.searchEvents(
						plan.query,
						buildEventFilter({
							after: plan.after,
							before: plan.before,
							branch: plan.branch,
							cwd: plan.cwd,
							limit: candidateLimit,
							repo: plan.repo,
							thread: plan.thread,
							tool: plan.tool,
						}),
					);
					addTextCandidates(eventCandidates, textMatches);
				}

				const recentMatches = await getRecentEvents(
					options.store,
					candidateLimit,
					{
						after: plan.after,
						before: plan.before,
						branch: plan.branch,
						cwd: plan.cwd,
						repo: plan.repo,
						thread: plan.thread,
						tool: plan.tool,
					},
					plan.eventTypes,
				);
				addRecentCandidates(eventCandidates, recentMatches);
			}

			const facts =
				plan.includeFacts && plan.query.length > 0
					? rankFacts(
							(await options.store.searchFacts(plan.query, candidateLimit)).filter(
								(fact) => fact.status === "active" && fact.valid_to == null,
							),
							plan.intents,
							plan.limit,
							currentTime,
						)
					: [];

			return {
				events: rankEvents(
					[...eventCandidates.values()],
					plan.limit,
					currentTime,
					plan.sources,
					plan.terms,
					plan.intents,
				),
				facts,
				plan,
			};
		},
	};
}
