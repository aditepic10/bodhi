import type { EventType } from "@bodhi/types";

import type { RetrievalIntent } from "./types";

interface IntentDefinition {
	eventTypes: readonly EventType[];
	keywords: readonly string[];
	phrases: readonly string[];
}

const ALL_EVENT_TYPES = [
	"shell.command.executed",
	"shell.command.started",
	"git.commit.created",
	"git.checkout",
	"git.merge",
	"git.rewrite",
	"ai.prompt",
	"ai.tool_call",
	"note.created",
] as const satisfies readonly EventType[];

const INTENT_DEFINITIONS: Readonly<Record<RetrievalIntent, IntentDefinition>> = {
	ai_help: {
		eventTypes: ["ai.prompt", "ai.tool_call"],
		keywords: [
			"ai",
			"assistant",
			"ask",
			"asked",
			"claude",
			"codex",
			"help",
			"llm",
			"opencode",
			"prompt",
			"tool",
		],
		phrases: ["what ai help", "what did i ask", "what did i ask ai"],
	},
	debugging: {
		eventTypes: ["shell.command.executed", "ai.prompt", "ai.tool_call", "note.created"],
		keywords: [
			"bug",
			"debug",
			"debugging",
			"error",
			"failing",
			"failure",
			"fix",
			"issue",
			"problem",
			"troubleshoot",
		],
		phrases: ["how was i debugging", "how did i debug"],
	},
	git_history: {
		eventTypes: ["git.commit.created", "git.checkout", "git.merge", "git.rewrite"],
		keywords: [
			"branch",
			"branches",
			"checkout",
			"commit",
			"commits",
			"git",
			"history",
			"merge",
			"merged",
			"rebase",
			"rewrite",
		],
		phrases: ["what happened on", "git history"],
	},
	notes_facts: {
		eventTypes: ["note.created"],
		keywords: ["fact", "facts", "note", "notes", "preference", "remember", "remembered"],
		phrases: ["what do you know", "what should i remember"],
	},
	recent_activity: {
		eventTypes: ALL_EVENT_TYPES,
		keywords: ["activity", "done", "lately", "recent", "recently", "up"],
		phrases: [
			"what did i do",
			"what have i been up to",
			"what was i doing",
			"what just happened",
			"what happened recently",
		],
	},
	resume_branch: {
		eventTypes: ["git.commit.created", "git.checkout", "git.merge", "git.rewrite", "ai.prompt"],
		keywords: ["branch", "continue", "left", "resume"],
		phrases: ["resume branch", "where did i leave off"],
	},
};

function hasPhrase(normalizedQuestion: string, phrases: readonly string[]): boolean {
	return phrases.some((phrase) => normalizedQuestion.includes(phrase));
}

export function listIntentEventTypes(intents: readonly RetrievalIntent[]): EventType[] {
	const eventTypes = new Set<EventType>();
	for (const intent of intents) {
		for (const eventType of INTENT_DEFINITIONS[intent].eventTypes) {
			eventTypes.add(eventType);
		}
	}
	return [...eventTypes];
}

export function classifyIntentMatch(
	eventType: EventType,
	intents: readonly RetrievalIntent[],
): number {
	let best = 0;
	for (const intent of intents) {
		if (INTENT_DEFINITIONS[intent].eventTypes.includes(eventType)) {
			best = Math.max(best, 1);
		}
	}
	return best;
}

export function deriveIntents(
	normalizedQuestion: string,
	terms: readonly string[],
	branch?: string,
): RetrievalIntent[] {
	const intents = new Set<RetrievalIntent>();

	for (const [intent, definition] of Object.entries(INTENT_DEFINITIONS) as Array<
		[RetrievalIntent, IntentDefinition]
	>) {
		if (
			hasPhrase(normalizedQuestion, definition.phrases) ||
			definition.keywords.some((keyword) => terms.includes(keyword))
		) {
			intents.add(intent);
		}
	}

	if (branch) {
		intents.add("resume_branch");
	}

	if (intents.size === 0) {
		intents.add("recent_activity");
	}

	return [...intents];
}

export function wantsFacts(intents: readonly RetrievalIntent[]): boolean {
	return intents.includes("notes_facts") || intents.includes("debugging");
}
