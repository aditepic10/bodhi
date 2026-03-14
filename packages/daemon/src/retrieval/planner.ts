import type { EventSource, EventType } from "@bodhi/types";

import type { RetrievalOverrides, RetrievalPlan, RetrievalPlanner } from "./types";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"been",
	"did",
	"do",
	"does",
	"for",
	"have",
	"how",
	"i",
	"in",
	"is",
	"me",
	"my",
	"of",
	"on",
	"or",
	"the",
	"to",
	"what",
]);

interface RetrievalFacet {
	eventTypes: readonly EventType[];
	keywords: readonly string[];
	sources: readonly EventSource[];
}

const RETRIEVAL_FACETS: readonly RetrievalFacet[] = [
	{
		eventTypes: ["shell.command.executed", "shell.command.started"],
		keywords: ["command", "commands", "execute", "executed", "ran", "run", "shell", "terminal"],
		sources: ["shell"],
	},
	{
		eventTypes: ["git.commit.created", "git.checkout", "git.merge", "git.rewrite"],
		keywords: ["branch", "branches", "commit", "commits", "git", "merge", "merged"],
		sources: ["git"],
	},
	{
		eventTypes: ["note.created"],
		keywords: ["note", "notes", "wrote", "written"],
		sources: ["manual"],
	},
];

export interface RetrievalPlannerOptions {
	now?: () => Date;
}

function clampLimit(limit?: number): number {
	return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function singularize(token: string): string {
	if (token.endsWith("ies") && token.length > 4) {
		return `${token.slice(0, -3)}y`;
	}
	if (token.endsWith("s") && token.length > 4) {
		return token.slice(0, -1);
	}
	return token;
}

function tokenize(question: string): string[] {
	const tokens = new Set<string>();
	for (const raw of question.toLowerCase().match(/[a-z0-9_./-]+/g) ?? []) {
		const singular = singularize(raw);
		for (const token of [raw, singular]) {
			if (token.length < 2 || STOP_WORDS.has(token)) {
				continue;
			}
			tokens.add(token);
		}
	}
	return [...tokens];
}

function startOfUtcDay(date: Date): number {
	return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
}

function deriveTimeWindow(question: string, now: Date): { after?: number; before?: number } {
	const normalized = question.toLowerCase();
	if (normalized.includes("today")) {
		return {
			after: startOfUtcDay(now),
			before: Math.floor(now.getTime() / 1000),
		};
	}
	if (normalized.includes("yesterday")) {
		const end = startOfUtcDay(now);
		return {
			after: end - 86_400,
			before: end - 1,
		};
	}
	return {};
}

function deriveFacets(tokens: readonly string[]): {
	eventTypes: EventType[];
	sources: EventSource[];
} {
	const eventTypes = new Set<EventType>();
	const sources = new Set<EventSource>();
	for (const facet of RETRIEVAL_FACETS) {
		if (!facet.keywords.some((keyword) => tokens.includes(keyword))) {
			continue;
		}
		for (const eventType of facet.eventTypes) {
			eventTypes.add(eventType);
		}
		for (const source of facet.sources) {
			sources.add(source);
		}
	}

	return {
		eventTypes: [...eventTypes],
		sources: [...sources],
	};
}

function normalizeOverrides(
	fallback: { eventTypes: EventType[]; sources: EventSource[] },
	overrides: RetrievalOverrides,
): {
	eventTypes: readonly EventType[];
	sources: readonly EventSource[];
} {
	return {
		eventTypes: overrides.eventTypes ?? fallback.eventTypes,
		sources: overrides.sources ?? fallback.sources,
	};
}

export function createRetrievalPlanner(options: RetrievalPlannerOptions = {}): RetrievalPlanner {
	const now = options.now ?? (() => new Date());

	return {
		plan(question, overrides = {}): RetrievalPlan {
			const terms = tokenize(question);
			const derivedTimeWindow = deriveTimeWindow(question, now());
			const derivedFacets = deriveFacets(terms);
			const constrained = normalizeOverrides(derivedFacets, overrides);

			return {
				after: overrides.after ?? derivedTimeWindow.after,
				before: overrides.before ?? derivedTimeWindow.before,
				branch: overrides.branch,
				cwd: overrides.cwd,
				eventTypes: constrained.eventTypes,
				includeEvents: overrides.includeEvents ?? true,
				includeFacts: overrides.includeFacts ?? true,
				limit: clampLimit(overrides.limit),
				query: terms.join(" "),
				repo: overrides.repo,
				sources: constrained.sources,
				thread: overrides.thread,
				terms,
				tool: overrides.tool,
			};
		},
	};
}
