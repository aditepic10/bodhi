import type { Database } from "bun:sqlite";
import type { ActivityContext, BodhiEvent, EventType, Store, StoredEvent } from "@bodhi/types";

import type { aiPromptEventsTable } from "../ai-prompt-events.sql";
import type { aiToolCallEventsTable } from "../ai-tool-call-events.sql";
import type { eventContextsTable } from "../event-contexts.sql";
import type { eventsTable } from "../events.sql";
import type { factsTable } from "../facts.sql";
import type { gitCheckoutEventsTable } from "../git-checkout-events.sql";
import type { gitCommitEventsTable } from "../git-commit-events.sql";
import type { gitCommitFilesTable } from "../git-commit-files.sql";
import type { gitMergeEventsTable } from "../git-merge-events.sql";
import type { gitRewriteEventsTable } from "../git-rewrite-events.sql";
import type { noteEventsTable } from "../note-events.sql";
import type { shellCommandEventsTable } from "../shell-command-events.sql";

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;
export const INTEL_VISIBILITY_TIMEOUT_SECONDS = 5 * 60;

export type EventEnvelopeRow = typeof eventsTable.$inferSelect;
export type EventContextRow = typeof eventContextsTable.$inferSelect;
export type EventContextInsert = typeof eventContextsTable.$inferInsert;
export type ShellCommandEventRow = typeof shellCommandEventsTable.$inferSelect;
export type GitCommitEventRow = typeof gitCommitEventsTable.$inferSelect;
export type GitCommitFileRow = typeof gitCommitFilesTable.$inferSelect;
export type GitCheckoutEventRow = typeof gitCheckoutEventsTable.$inferSelect;
export type GitMergeEventRow = typeof gitMergeEventsTable.$inferSelect;
export type GitRewriteEventRow = typeof gitRewriteEventsTable.$inferSelect;
export type AiPromptEventRow = typeof aiPromptEventsTable.$inferSelect;
export type AiToolCallEventRow = typeof aiToolCallEventsTable.$inferSelect;
export type NoteEventRow = typeof noteEventsTable.$inferSelect;

export type FactRow = typeof factsTable.$inferSelect;

export interface PipelineLike {
	process(event: BodhiEvent): BodhiEvent | null;
}

export interface SqliteStore extends Store {
	db: Database;
}

export interface CreateStoreOptions {
	autoApprove?: boolean;
}

export type EventPayloadByType = {
	"shell.command.executed": ShellCommandEventRow;
	"shell.command.started": ShellCommandEventRow;
	"git.commit.created": GitCommitEventRow;
	"git.checkout": GitCheckoutEventRow;
	"git.merge": GitMergeEventRow;
	"git.rewrite": GitRewriteEventRow;
	"ai.prompt": AiPromptEventRow;
	"ai.tool_call": AiToolCallEventRow;
	"note.created": NoteEventRow;
};

export type EventByType<TType extends EventType> = Extract<BodhiEvent, { type: TType }>;
export type StoredEventByType<TType extends EventType> = Extract<StoredEvent, { type: TType }>;

export interface StoredEventParts<TType extends EventType = EventType> {
	context?: ActivityContext;
	envelope: EventEnvelopeRow;
	payload: EventPayloadByType[TType];
	commitFiles?: string[];
}

export interface EventTypeHandler<TType extends EventType = EventType> {
	readonly type: TType;
	hydrate(parts: StoredEventParts<TType>): StoredEventByType<TType>;
	insert(db: Database, eventId: string, event: EventByType<TType>): void;
	load(db: Database, eventIds: readonly string[]): Promise<Map<string, EventPayloadByType[TType]>>;
}
