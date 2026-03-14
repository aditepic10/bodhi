import type { Database } from "bun:sqlite";
import { asc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";

import { aiPromptEventsTable } from "../ai-prompt-events.sql";
import { aiToolCallEventsTable } from "../ai-tool-call-events.sql";
import { gitCheckoutEventsTable } from "../git-checkout-events.sql";
import { gitCommitEventsTable } from "../git-commit-events.sql";
import { gitCommitFilesTable } from "../git-commit-files.sql";
import { gitMergeEventsTable } from "../git-merge-events.sql";
import { gitRewriteEventsTable } from "../git-rewrite-events.sql";
import { gitRewriteMappingsTable } from "../git-rewrite-mappings.sql";
import { noteEventsTable } from "../note-events.sql";
import { shellCommandEventsTable } from "../shell-command-events.sql";
import type {
	AiPromptEventRow,
	AiToolCallEventRow,
	EventByType,
	EventPayloadByType,
	GitCheckoutEventRow,
	GitCommitEventRow,
	GitMergeEventRow,
	GitRewriteEventRow,
	GitRewriteMappingRow,
	NoteEventRow,
	ShellCommandEventRow,
} from "./types";

function eventIdMap<T extends { event_id: string }>(rows: T[]): Map<string, T> {
	return new Map(rows.map((row) => [row.event_id, row]));
}

export function insertShellCommandExecutedPayload(
	db: Database,
	eventId: string,
	event: EventByType<"shell.command.executed">,
): void {
	const orm = drizzle(db);
	orm
		.insert(shellCommandEventsTable)
		.values({
			command: event.metadata.command,
			duration_ms: event.metadata.duration_ms,
			event_id: eventId,
			exit_code: event.metadata.exit_code,
		})
		.run();
}

export function insertShellCommandStartedPayload(
	db: Database,
	eventId: string,
	event: EventByType<"shell.command.started">,
): void {
	const orm = drizzle(db);
	orm
		.insert(shellCommandEventsTable)
		.values({
			command: event.metadata.command,
			duration_ms: null,
			event_id: eventId,
			exit_code: null,
		})
		.run();
}

export function insertGitCommitPayload(
	db: Database,
	eventId: string,
	event: EventByType<"git.commit.created">,
): void {
	const orm = drizzle(db);
	orm
		.insert(gitCommitEventsTable)
		.values({
			deletions: event.metadata.deletions ?? null,
			event_id: eventId,
			files_changed: event.metadata.files_changed,
			hash: event.metadata.hash,
			insertions: event.metadata.insertions ?? null,
			message: event.metadata.message,
			parent_count: event.metadata.parent_count,
		})
		.run();

	for (const path of event.metadata.files ?? []) {
		orm
			.insert(gitCommitFilesTable)
			.values({
				event_id: eventId,
				id: nanoid(),
				path,
			})
			.run();
	}
}

export function insertGitCheckoutPayload(
	db: Database,
	eventId: string,
	event: EventByType<"git.checkout">,
): void {
	const orm = drizzle(db);
	orm
		.insert(gitCheckoutEventsTable)
		.values({
			checkout_kind: event.metadata.checkout_kind,
			event_id: eventId,
			from_branch: event.metadata.from_branch ?? null,
			from_sha: event.metadata.from_sha ?? null,
			to_branch: event.metadata.to_branch ?? null,
			to_sha: event.metadata.to_sha ?? null,
		})
		.run();
}

export function insertGitMergePayload(
	db: Database,
	eventId: string,
	event: EventByType<"git.merge">,
): void {
	const orm = drizzle(db);
	orm
		.insert(gitMergeEventsTable)
		.values({
			event_id: eventId,
			is_squash: event.metadata.is_squash ?? false,
			merge_commit_sha: event.metadata.merge_commit_sha,
			parent_count: event.metadata.parent_count,
		})
		.run();
}

export function insertGitRewritePayload(
	db: Database,
	eventId: string,
	event: EventByType<"git.rewrite">,
): void {
	const orm = drizzle(db);
	orm
		.insert(gitRewriteEventsTable)
		.values({
			event_id: eventId,
			rewrite_type: event.metadata.rewrite_type,
			rewritten_commit_count: event.metadata.rewritten_commit_count,
		})
		.run();

	for (const mapping of event.metadata.mappings ?? []) {
		orm
			.insert(gitRewriteMappingsTable)
			.values({
				event_id: eventId,
				id: nanoid(),
				new_commit_sha: mapping.to_hash,
				old_commit_sha: mapping.from_hash,
			})
			.run();
	}
}

export function insertAiPromptPayload(
	db: Database,
	eventId: string,
	event: EventByType<"ai.prompt">,
): void {
	const orm = drizzle(db);
	orm
		.insert(aiPromptEventsTable)
		.values({
			content: event.metadata.content,
			event_id: eventId,
		})
		.run();
}

export function insertAiToolCallPayload(
	db: Database,
	eventId: string,
	event: EventByType<"ai.tool_call">,
): void {
	const orm = drizzle(db);
	orm
		.insert(aiToolCallEventsTable)
		.values({
			description: event.metadata.description ?? null,
			event_id: eventId,
			target: event.metadata.target ?? null,
			tool_name: event.metadata.tool_name,
		})
		.run();
}

export function insertNotePayload(
	db: Database,
	eventId: string,
	event: EventByType<"note.created">,
): void {
	const orm = drizzle(db);
	orm
		.insert(noteEventsTable)
		.values({
			content: event.metadata.content,
			event_id: eventId,
		})
		.run();
}

export async function loadShellCommandPayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, ShellCommandEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(shellCommandEventsTable)
			.where(inArray(shellCommandEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export async function loadGitCommitPayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, GitCommitEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(gitCommitEventsTable)
			.where(inArray(gitCommitEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export async function loadGitCommitFileLists(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, string[]>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	const rows = orm
		.select()
		.from(gitCommitFilesTable)
		.where(inArray(gitCommitFilesTable.event_id, [...eventIds]))
		.orderBy(asc(gitCommitFilesTable._rowid))
		.all();

	const files = new Map<string, string[]>();
	for (const row of rows) {
		const existing = files.get(row.event_id) ?? [];
		existing.push(row.path);
		files.set(row.event_id, existing);
	}

	return files;
}

export async function loadGitCheckoutPayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, GitCheckoutEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(gitCheckoutEventsTable)
			.where(inArray(gitCheckoutEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export async function loadGitMergePayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, GitMergeEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(gitMergeEventsTable)
			.where(inArray(gitMergeEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export async function loadGitRewritePayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, GitRewriteEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(gitRewriteEventsTable)
			.where(inArray(gitRewriteEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export async function loadGitRewriteMappings(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, Array<{ from_hash: string; to_hash: string }>>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	const rows: GitRewriteMappingRow[] = orm
		.select()
		.from(gitRewriteMappingsTable)
		.where(inArray(gitRewriteMappingsTable.event_id, [...eventIds]))
		.orderBy(asc(gitRewriteMappingsTable._rowid))
		.all();

	const mappings = new Map<string, Array<{ from_hash: string; to_hash: string }>>();
	for (const row of rows) {
		const existing = mappings.get(row.event_id) ?? [];
		existing.push({
			from_hash: row.old_commit_sha,
			to_hash: row.new_commit_sha,
		});
		mappings.set(row.event_id, existing);
	}

	return mappings;
}

export async function loadAiPromptPayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, AiPromptEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(aiPromptEventsTable)
			.where(inArray(aiPromptEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export async function loadAiToolCallPayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, AiToolCallEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(aiToolCallEventsTable)
			.where(inArray(aiToolCallEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export async function loadNotePayloads(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, NoteEventRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	return eventIdMap(
		orm
			.select()
			.from(noteEventsTable)
			.where(inArray(noteEventsTable.event_id, [...eventIds]))
			.all(),
	);
}

export type PayloadLoaderMap = {
	[K in keyof EventPayloadByType]: (
		db: Database,
		eventIds: readonly string[],
	) => Promise<Map<string, EventPayloadByType[K]>>;
};
