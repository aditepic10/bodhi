import type { Database } from "bun:sqlite";
import type {
	ActivityContext,
	BodhiEvent,
	Fact,
	FactCreatedBy,
	FactStatus,
	StoredEvent,
} from "@bodhi/types";
import {
	FactCreatedBySchema,
	FactStatusSchema,
	GitStateSchema,
	StoredEventSchema,
} from "@bodhi/types";

import type { EventContextInsert, EventContextRow, FactRow, PipelineLike } from "./types";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./types";

export function clampLimit(limit?: number): number {
	return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

export function normalizeFtsQuery(query: string): string {
	const tokens = [...new Set(query.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [])];
	if (tokens.length === 0) {
		return `"${query.replaceAll('"', '""')}"`;
	}

	return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function inferSource(type: BodhiEvent["type"]): StoredEvent["source"] {
	if (type.startsWith("shell.")) {
		return "shell";
	}
	if (type.startsWith("git.")) {
		return "git";
	}
	if (type.startsWith("ai.")) {
		return "ai";
	}
	if (type === "note.created") {
		return "manual";
	}
	return "api";
}

export function sourceForEvent(event: BodhiEvent): StoredEvent["source"] {
	return inferSource(event.type);
}

export function mapContext(row?: EventContextRow | null): ActivityContext | undefined {
	if (!row) {
		return undefined;
	}

	const context: ActivityContext = {};
	if (row.repo_id) {
		context.repo_id = row.repo_id;
	}
	if (row.worktree_root) {
		context.worktree_root = row.worktree_root;
	}
	if (row.branch) {
		context.branch = row.branch;
	}
	if (row.head_sha) {
		context.head_sha = row.head_sha;
	}
	if (row.git_state) {
		context.git_state = GitStateSchema.parse(row.git_state);
	}
	if (row.cwd) {
		context.cwd = row.cwd;
	}
	if (row.relative_cwd) {
		context.relative_cwd = row.relative_cwd;
	}
	if (row.terminal_session) {
		context.terminal_session = row.terminal_session;
	}
	if (row.tool) {
		context.tool = row.tool;
	}
	if (row.thread_id) {
		context.thread_id = row.thread_id;
	}

	return Object.keys(context).length > 0 ? context : undefined;
}

export function toContextRow(
	eventId: string,
	context?: ActivityContext,
): EventContextInsert | undefined {
	if (!context) {
		return undefined;
	}

	return {
		event_id: eventId,
		repo_id: context.repo_id ?? null,
		worktree_root: context.worktree_root ?? null,
		branch: context.branch ?? null,
		head_sha: context.head_sha ?? null,
		git_state: context.git_state ?? null,
		cwd: context.cwd ?? null,
		relative_cwd: context.relative_cwd ?? null,
		terminal_session: context.terminal_session ?? null,
		tool: context.tool ?? null,
		thread_id: context.thread_id ?? null,
	};
}

export function mapFact(row: FactRow): Fact {
	return {
		id: row.id,
		key: row.key,
		value: row.value,
		created_by: FactCreatedBySchema.parse(row.created_by),
		source_event_id: row.source_event_id ?? undefined,
		status: FactStatusSchema.parse(row.status),
		confidence: row.confidence,
		schema_version: row.schema_version,
		supersedes_fact_id: row.supersedes_fact_id ?? undefined,
		extraction_meta: row.extraction_meta ?? undefined,
		valid_from: row.valid_from ?? undefined,
		valid_to: row.valid_to ?? undefined,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

export function withImmediateTransaction<T>(db: Database, operation: () => T): T {
	db.exec("BEGIN IMMEDIATE");
	try {
		const result = operation();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}

export function normalizeFactStatus(
	createdBy: FactCreatedBy,
	currentStatus: FactStatus,
	autoApprove: boolean,
): FactStatus {
	if (createdBy === "intel" || createdBy === "agent") {
		return autoApprove ? "active" : "pending";
	}

	return currentStatus;
}

export function redactForEgress(events: StoredEvent[], pipeline: PipelineLike): StoredEvent[] {
	const redactedEvents: StoredEvent[] = [];

	for (const event of events) {
		const redacted = pipeline.process(event);
		if (!redacted) {
			continue;
		}

		redactedEvents.push(
			StoredEventSchema.parse({
				...event,
				...redacted,
				context: redacted.context,
				metadata: redacted.metadata,
			}),
		);
	}

	return redactedEvents;
}
