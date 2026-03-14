import type { EventSource, EventType, Fact, StoredEvent } from "@bodhi/types";

import { classifyIntentMatch } from "./intents";
import type { RetrievalIntent } from "./types";

export interface EventCandidate {
	event: StoredEvent;
	ftsRank?: number;
	recentRank?: number;
}

export interface FactCandidate {
	fact: Fact;
	searchRank?: number;
}

interface EventRankingContext {
	intents: readonly RetrievalIntent[];
	maxFtsRank: number;
	maxRecentRank: number;
	now: number;
	sources: readonly EventSource[];
	terms: readonly string[];
}

function eventText(event: StoredEvent): string {
	switch (event.type) {
		case "shell.command.executed":
		case "shell.command.started":
			return event.metadata.command;
		case "git.commit.created":
			return `${event.metadata.message} ${(event.metadata.files ?? []).join(" ")}`;
		case "git.checkout":
			return `${event.metadata.checkout_kind} ${event.metadata.from_branch ?? ""} ${event.metadata.to_branch ?? ""}`.trim();
		case "git.merge":
			return `${event.metadata.merge_commit_sha} ${event.metadata.parent_count} ${event.metadata.is_squash ? "squash" : ""}`.trim();
		case "git.rewrite":
			return `${event.metadata.rewrite_type} ${event.metadata.rewritten_commit_count}`.trim();
		case "ai.prompt":
			return event.metadata.content;
		case "ai.tool_call":
			return `${event.metadata.tool_name} ${event.metadata.target ?? ""} ${event.metadata.description ?? ""}`.trim();
		case "note.created":
			return event.metadata.content;
	}
}

function exactTermOverlap(text: string, terms: readonly string[]): number {
	if (terms.length === 0) {
		return 0;
	}

	const normalized = text.toLowerCase();
	let matches = 0;
	for (const term of terms) {
		if (normalized.includes(term)) {
			matches += 1;
		}
	}
	return matches / terms.length;
}

function normalizedRank(rank: number | undefined, maxRank: number): number {
	if (rank == null || maxRank <= 0) {
		return 0;
	}
	return 1 - rank / maxRank;
}

function recencyScore(createdAt: number, now: number): number {
	const ageSeconds = Math.max(0, now - createdAt);
	const decayWindow = 86_400 * 7;
	return 1 / (1 + ageSeconds / decayWindow);
}

function eventFamilyWeight(eventType: EventType): number {
	switch (eventType) {
		case "git.commit.created":
		case "git.merge":
		case "git.rewrite":
			return 1;
		case "ai.prompt":
		case "ai.tool_call":
			return 0.9;
		case "note.created":
			return 0.65;
		case "shell.command.executed":
			return 0.55;
		case "git.checkout":
			return 0.5;
		case "shell.command.started":
			return 0.2;
	}
}

function outcomeWeight(eventType: EventType): number {
	switch (eventType) {
		case "git.commit.created":
		case "git.merge":
		case "git.rewrite":
		case "ai.tool_call":
			return 1;
		case "ai.prompt":
		case "note.created":
		case "shell.command.executed":
			return 0.6;
		case "git.checkout":
			return 0.5;
		case "shell.command.started":
			return 0.1;
	}
}

export function rankEventCandidate(
	candidate: EventCandidate,
	context: EventRankingContext,
): number {
	const text = eventText(candidate.event);
	const features = {
		exactTermOverlap: exactTermOverlap(text, context.terms),
		eventFamilyWeight: eventFamilyWeight(candidate.event.type),
		ftsScore: normalizedRank(candidate.ftsRank, context.maxFtsRank),
		intentMatch: classifyIntentMatch(candidate.event.type, context.intents),
		outcomeWeight: outcomeWeight(candidate.event.type),
		recencyScore: recencyScore(candidate.event.created_at, context.now),
		recentScore: normalizedRank(candidate.recentRank, context.maxRecentRank),
		sourceMatch:
			context.sources.length === 0 || context.sources.includes(candidate.event.source) ? 1 : 0,
	};

	return (
		features.intentMatch * 4 +
		features.recencyScore * 3 +
		features.sourceMatch * 2 +
		features.ftsScore * 2 +
		features.exactTermOverlap * 1.5 +
		features.recentScore * 1 +
		features.eventFamilyWeight * 1.5 +
		features.outcomeWeight * 1
	);
}

export function rankFactCandidate(
	candidate: FactCandidate,
	intents: readonly RetrievalIntent[],
	now: number,
): number {
	const ageSeconds = Math.max(0, now - candidate.fact.created_at);
	const freshness = 1 / (1 + ageSeconds / (86_400 * 30));
	const intentWeight = intents.includes("notes_facts")
		? 1
		: intents.includes("debugging")
			? 0.5
			: 0.2;
	const searchScore = candidate.searchRank == null ? 0 : 1 - candidate.searchRank / 20;

	return candidate.fact.confidence * 3 + freshness + intentWeight + searchScore;
}
