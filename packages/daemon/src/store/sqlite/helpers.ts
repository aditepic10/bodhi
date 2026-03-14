import type { Database } from "bun:sqlite";
import type { BodhiEvent, Fact, FactCreatedBy, FactStatus, StoredEvent } from "@bodhi/types";

import type { FactRow, PipelineLike, StoredEventRow } from "./types";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./types";

export function clampLimit(limit?: number): number {
	return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function deriveEventContent(event: BodhiEvent): string {
	switch (event.type) {
		case "shell.command.executed":
		case "shell.command.started":
			return event.metadata.command;
		case "git.commit.created":
			return `${event.metadata.branch} ${event.metadata.message}`;
		case "note.created":
			return event.metadata.content;
		case "fact.extracted":
			return `${event.metadata.key} ${event.metadata.value}`;
		case "conversation.message":
			return event.metadata.content;
	}

	return "";
}

export function eventContentForStorage(event: BodhiEvent): string {
	return deriveEventContent(event);
}

export function normalizeFtsQuery(query: string): string {
	const tokens = [...new Set(query.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [])];
	if (tokens.length === 0) {
		return `"${query.replaceAll('"', '""')}"`;
	}

	return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function inferSource(type: string): StoredEvent["source"] {
	if (type.startsWith("shell.")) {
		return "shell";
	}
	if (type.startsWith("git.")) {
		return "git";
	}
	return "api";
}

export function sourceForEvent(event: BodhiEvent): StoredEvent["source"] {
	return inferSource(event.type);
}

export function mapStoredEvent(row: StoredEventRow): StoredEvent {
	const metadata = JSON.parse(row.metadata) as StoredEvent["metadata"];
	return {
		type: row.type as BodhiEvent["type"],
		metadata,
		id: row.id,
		event_id: row.event_id,
		source: row.source as StoredEvent["source"],
		session_id: row.session_id ?? undefined,
		machine_id: row.machine_id ?? undefined,
		schema_version: row.schema_version,
		producer_version: row.producer_version ?? undefined,
		created_at: row.created_at,
		processed_at: row.processed_at ?? undefined,
		started_at: row.started_at ?? undefined,
	} as StoredEvent;
}

export function mapFact(row: FactRow): Fact {
	return {
		id: row.id,
		key: row.key,
		value: row.value,
		created_by: row.created_by,
		source_event_id: row.source_event_id ?? undefined,
		status: row.status,
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
	return events
		.map((event) => {
			const redacted = pipeline.process(event);
			if (!redacted) {
				return null;
			}

			return {
				...event,
				...redacted,
				metadata: redacted.metadata,
			} as StoredEvent;
		})
		.filter((event): event is StoredEvent => event !== null);
}
