import type { EventSource, EventType } from "@bodhi/types";

import { deriveIntents, listIntentEventTypes } from "./intents";
import type { RetrievalPlan, RetrievalPlanner } from "./types";

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
	"up",
	"what",
]);

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

function deriveSources(question: string, terms: readonly string[]): EventSource[] {
	const sources = new Set<EventSource>();
	const normalized = question.toLowerCase();

	if (
		terms.some((term) =>
			["ai", "assistant", "claude", "codex", "opencode", "prompt"].includes(term),
		)
	) {
		sources.add("ai");
	}
	if (
		terms.some((term) =>
			["branch", "checkout", "commit", "git", "merge", "rebase", "rewrite"].includes(term),
		)
	) {
		sources.add("git");
	}
	if (
		terms.some((term) => ["command", "commands", "run", "ran", "shell", "terminal"].includes(term))
	) {
		sources.add("shell");
	}
	if (terms.some((term) => ["note", "notes"].includes(term))) {
		sources.add("manual");
	}
	if (sources.size === 0 && normalized.includes("what have i been up to")) {
		sources.add("shell");
		sources.add("git");
		sources.add("ai");
		sources.add("manual");
	}

	return [...sources];
}

function eventTypesForSources(sources: readonly EventSource[]): EventType[] {
	const eventTypes = new Set<EventType>();
	for (const source of sources) {
		switch (source) {
			case "ai":
				eventTypes.add("ai.prompt");
				eventTypes.add("ai.tool_call");
				break;
			case "git":
				eventTypes.add("git.commit.created");
				eventTypes.add("git.checkout");
				eventTypes.add("git.merge");
				eventTypes.add("git.rewrite");
				break;
			case "manual":
				eventTypes.add("note.created");
				break;
			case "shell":
				eventTypes.add("shell.command.executed");
				eventTypes.add("shell.command.started");
				break;
			case "api":
				break;
		}
	}
	return [...eventTypes];
}

export function createRetrievalPlanner(options: RetrievalPlannerOptions = {}): RetrievalPlanner {
	const now = options.now ?? (() => new Date());

	return {
		plan(question, overrides = {}): RetrievalPlan {
			const normalizedQuestion = question.toLowerCase();
			const terms = tokenize(question);
			const derivedTimeWindow = deriveTimeWindow(question, now());
			const intents = deriveIntents(normalizedQuestion, terms, overrides.branch);
			const derivedSources = deriveSources(question, terms);
			const derivedEventTypes = new Set<EventType>(listIntentEventTypes(intents));
			for (const eventType of eventTypesForSources(derivedSources)) {
				derivedEventTypes.add(eventType);
			}

			return {
				after: overrides.after ?? derivedTimeWindow.after,
				before: overrides.before ?? derivedTimeWindow.before,
				branch: overrides.branch,
				cwd: overrides.cwd,
				eventTypes: overrides.eventTypes ?? [...derivedEventTypes],
				includeEvents: overrides.includeEvents ?? true,
				includeFacts: overrides.includeFacts ?? true,
				intents,
				limit: clampLimit(overrides.limit),
				query: terms.join(" "),
				repo: overrides.repo,
				sources: overrides.sources ?? derivedSources,
				thread: overrides.thread,
				terms,
				tool: overrides.tool,
			};
		},
	};
}
