import type { Database } from "bun:sqlite";
import type { EventFilter, EventType, StoredEvent } from "@bodhi/types";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";

import { eventContextsTable } from "../event-contexts.sql";
import { eventsTable } from "../events.sql";
import { nowUnix } from "../schema.sql";
import {
	hydrateAiPrompt,
	hydrateAiToolCall,
	hydrateGitCheckout,
	hydrateGitCommitCreated,
	hydrateGitMerge,
	hydrateGitRewrite,
	hydrateNoteCreated,
	hydrateShellCommandExecuted,
	hydrateShellCommandStarted,
} from "./event-hydrators";
import {
	insertAiPromptPayload,
	insertAiToolCallPayload,
	insertGitCheckoutPayload,
	insertGitCommitPayload,
	insertGitMergePayload,
	insertGitRewritePayload,
	insertNotePayload,
	insertShellCommandExecutedPayload,
	insertShellCommandStartedPayload,
	loadAiPromptPayloads,
	loadAiToolCallPayloads,
	loadGitCheckoutPayloads,
	loadGitCommitFileLists,
	loadGitCommitPayloads,
	loadGitMergePayloads,
	loadGitRewriteMappings,
	loadGitRewritePayloads,
	loadNotePayloads,
	loadShellCommandPayloads,
} from "./event-payloads";
import {
	clampLimit,
	mapContext,
	normalizeFtsQuery,
	toContextRow,
	withImmediateTransaction,
} from "./helpers";
import { deriveSearchText } from "./search-text";
import type { EventContextRow, EventEnvelopeRow, SqliteStore } from "./types";
import { INTEL_VISIBILITY_TIMEOUT_SECONDS } from "./types";

type EventStoreMethods = Pick<
	SqliteStore,
	| "appendEvent"
	| "getEvents"
	| "searchEvents"
	| "getUnprocessedEvents"
	| "markStarted"
	| "markProcessed"
>;

type TypedEnvelope<TType extends EventType> = EventEnvelopeRow & { type: TType };

async function loadContexts(
	db: Database,
	eventIds: readonly string[],
): Promise<Map<string, EventContextRow>> {
	if (eventIds.length === 0) {
		return new Map();
	}

	const orm = drizzle(db);
	const rows = orm
		.select()
		.from(eventContextsTable)
		.where(inArray(eventContextsTable.event_id, [...eventIds]))
		.all();

	return new Map(rows.map((row) => [row.event_id, row]));
}

async function hydrateEvents(
	db: Database,
	envelopes: readonly EventEnvelopeRow[],
): Promise<StoredEvent[]> {
	if (envelopes.length === 0) {
		return [];
	}

	const contexts = await loadContexts(
		db,
		envelopes.map((envelope) => envelope.id),
	);
	const commitFiles = await loadGitCommitFileLists(
		db,
		envelopes
			.filter((envelope): envelope is TypedEnvelope<"git.commit.created"> => {
				return envelope.type === "git.commit.created";
			})
			.map((envelope) => envelope.id),
	);
	const rewriteMappings = await loadGitRewriteMappings(
		db,
		envelopes
			.filter((envelope): envelope is TypedEnvelope<"git.rewrite"> => {
				return envelope.type === "git.rewrite";
			})
			.map((envelope) => envelope.id),
	);

	const hydratedById = new Map<string, StoredEvent>();
	const shellExecutedEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"shell.command.executed"> =>
			envelope.type === "shell.command.executed",
	);
	const shellStartedEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"shell.command.started"> =>
			envelope.type === "shell.command.started",
	);
	const gitCommitEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"git.commit.created"> =>
			envelope.type === "git.commit.created",
	);
	const gitCheckoutEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"git.checkout"> => envelope.type === "git.checkout",
	);
	const gitMergeEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"git.merge"> => envelope.type === "git.merge",
	);
	const gitRewriteEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"git.rewrite"> => envelope.type === "git.rewrite",
	);
	const aiPromptEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"ai.prompt"> => envelope.type === "ai.prompt",
	);
	const aiToolCallEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"ai.tool_call"> => envelope.type === "ai.tool_call",
	);
	const noteEnvelopes = envelopes.filter(
		(envelope): envelope is TypedEnvelope<"note.created"> => envelope.type === "note.created",
	);

	const shellPayloadIds = [
		...shellExecutedEnvelopes.map((envelope) => envelope.id),
		...shellStartedEnvelopes.map((envelope) => envelope.id),
	];
	const shellPayloads = await loadShellCommandPayloads(db, shellPayloadIds);
	for (const envelope of shellExecutedEnvelopes) {
		const payload = shellPayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateShellCommandExecuted({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}
	for (const envelope of shellStartedEnvelopes) {
		const payload = shellPayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateShellCommandStarted({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}

	const gitCommitPayloads = await loadGitCommitPayloads(
		db,
		gitCommitEnvelopes.map((envelope) => envelope.id),
	);
	for (const envelope of gitCommitEnvelopes) {
		const payload = gitCommitPayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateGitCommitCreated({
				commitFiles: commitFiles.get(envelope.id),
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}

	const gitCheckoutPayloads = await loadGitCheckoutPayloads(
		db,
		gitCheckoutEnvelopes.map((envelope) => envelope.id),
	);
	for (const envelope of gitCheckoutEnvelopes) {
		const payload = gitCheckoutPayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateGitCheckout({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}

	const gitMergePayloads = await loadGitMergePayloads(
		db,
		gitMergeEnvelopes.map((envelope) => envelope.id),
	);
	for (const envelope of gitMergeEnvelopes) {
		const payload = gitMergePayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateGitMerge({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}

	const gitRewritePayloads = await loadGitRewritePayloads(
		db,
		gitRewriteEnvelopes.map((envelope) => envelope.id),
	);
	for (const envelope of gitRewriteEnvelopes) {
		const payload = gitRewritePayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateGitRewrite({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
				rewriteMappings: rewriteMappings.get(envelope.id),
			}),
		);
	}

	const aiPromptPayloads = await loadAiPromptPayloads(
		db,
		aiPromptEnvelopes.map((envelope) => envelope.id),
	);
	for (const envelope of aiPromptEnvelopes) {
		const payload = aiPromptPayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateAiPrompt({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}

	const aiToolCallPayloads = await loadAiToolCallPayloads(
		db,
		aiToolCallEnvelopes.map((envelope) => envelope.id),
	);
	for (const envelope of aiToolCallEnvelopes) {
		const payload = aiToolCallPayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateAiToolCall({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}

	const notePayloads = await loadNotePayloads(
		db,
		noteEnvelopes.map((envelope) => envelope.id),
	);
	for (const envelope of noteEnvelopes) {
		const payload = notePayloads.get(envelope.id);
		if (!payload) {
			throw new Error(`missing payload for event ${envelope.id} (${envelope.type})`);
		}
		hydratedById.set(
			envelope.id,
			hydrateNoteCreated({
				context: mapContext(contexts.get(envelope.id)),
				envelope,
				payload,
			}),
		);
	}

	return envelopes.map((envelope) => {
		const hydrated = hydratedById.get(envelope.id);
		if (!hydrated) {
			throw new Error(`failed to hydrate event ${envelope.id} (${envelope.type})`);
		}
		return hydrated;
	});
}

export function createEventStore(db: Database): EventStoreMethods {
	const orm = drizzle(db);

	return {
		async appendEvent(event, source: StoredEvent["source"]) {
			const id = nanoid();
			const eventId = event.event_id ?? nanoid();
			const createdAt = event.created_at ?? nowUnix();
			const schemaVersion = event.schema_version ?? 1;
			const searchText = deriveSearchText(event);
			const contextRow = toContextRow(id, event.context);
			let storedEnvelope: EventEnvelopeRow | null = null;

			withImmediateTransaction(db, () => {
				storedEnvelope =
					orm.select().from(eventsTable).where(eq(eventsTable.event_id, eventId)).limit(1).get() ??
					null;
				if (storedEnvelope) {
					return;
				}

				orm
					.insert(eventsTable)
					.values({
						created_at: createdAt,
						event_id: eventId,
						id,
						machine_id: event.machine_id ?? null,
						producer_version: event.producer_version ?? null,
						schema_version: schemaVersion,
						search_text: searchText,
						session_id: event.session_id ?? null,
						source,
						type: event.type,
					})
					.run();

				storedEnvelope =
					orm.select().from(eventsTable).where(eq(eventsTable.event_id, eventId)).limit(1).get() ??
					null;
				if (!storedEnvelope) {
					throw new Error(`failed to append event ${eventId}`);
				}

				if (contextRow) {
					orm
						.insert(eventContextsTable)
						.values({
							...contextRow,
							event_id: storedEnvelope.id,
						})
						.run();
				}

				switch (event.type) {
					case "ai.prompt":
						insertAiPromptPayload(db, storedEnvelope.id, event);
						break;
					case "ai.tool_call":
						insertAiToolCallPayload(db, storedEnvelope.id, event);
						break;
					case "git.checkout":
						insertGitCheckoutPayload(db, storedEnvelope.id, event);
						break;
					case "git.commit.created":
						insertGitCommitPayload(db, storedEnvelope.id, event);
						break;
					case "git.merge":
						insertGitMergePayload(db, storedEnvelope.id, event);
						break;
					case "git.rewrite":
						insertGitRewritePayload(db, storedEnvelope.id, event);
						break;
					case "note.created":
						insertNotePayload(db, storedEnvelope.id, event);
						break;
					case "shell.command.executed":
						insertShellCommandExecutedPayload(db, storedEnvelope.id, event);
						break;
					case "shell.command.started":
						insertShellCommandStartedPayload(db, storedEnvelope.id, event);
						break;
				}
			});

			if (!storedEnvelope) {
				throw new Error(`failed to append event ${eventId}`);
			}

			const [stored] = await hydrateEvents(db, [storedEnvelope]);
			if (!stored) {
				throw new Error(`failed to hydrate event ${eventId}`);
			}

			return stored;
		},
		async getEvents(filter: EventFilter = {}) {
			const conditions = [
				filter.type ? eq(eventsTable.type, filter.type) : undefined,
				filter.source ? eq(eventsTable.source, filter.source) : undefined,
				filter.repo ? eq(eventContextsTable.repo_id, filter.repo) : undefined,
				filter.branch ? eq(eventContextsTable.branch, filter.branch) : undefined,
				filter.tool ? eq(eventContextsTable.tool, filter.tool) : undefined,
				filter.thread ? eq(eventContextsTable.thread_id, filter.thread) : undefined,
				filter.cwd ? eq(eventContextsTable.cwd, filter.cwd) : undefined,
				filter.after ? gte(eventsTable.created_at, filter.after) : undefined,
				filter.before ? lte(eventsTable.created_at, filter.before) : undefined,
			].filter(Boolean);

			const baseQuery = orm
				.select({ envelope: eventsTable })
				.from(eventsTable)
				.leftJoin(eventContextsTable, eq(eventContextsTable.event_id, eventsTable.id))
				.orderBy(desc(eventsTable.created_at), desc(eventsTable._rowid))
				.limit(clampLimit(filter.limit));

			const rows =
				conditions.length > 0 ? baseQuery.where(and(...conditions)).all() : baseQuery.all();

			return hydrateEvents(
				db,
				rows.map((row) => row.envelope),
			);
		},
		async searchEvents(query: string, filter: EventFilter = {}) {
			const clauses = ["events_fts MATCH ?"];
			const params: Array<string | number> = [normalizeFtsQuery(query)];

			if (filter.type) {
				clauses.push("e.type = ?");
				params.push(filter.type);
			}
			if (filter.source) {
				clauses.push("e.source = ?");
				params.push(filter.source);
			}
			if (filter.repo) {
				clauses.push("c.repo_id = ?");
				params.push(filter.repo);
			}
			if (filter.branch) {
				clauses.push("c.branch = ?");
				params.push(filter.branch);
			}
			if (filter.tool) {
				clauses.push("c.tool = ?");
				params.push(filter.tool);
			}
			if (filter.thread) {
				clauses.push("c.thread_id = ?");
				params.push(filter.thread);
			}
			if (filter.cwd) {
				clauses.push("c.cwd = ?");
				params.push(filter.cwd);
			}
			if (filter.after) {
				clauses.push("e.created_at >= ?");
				params.push(filter.after);
			}
			if (filter.before) {
				clauses.push("e.created_at <= ?");
				params.push(filter.before);
			}

			params.push(clampLimit(filter.limit));

			const envelopes = db
				.query<EventEnvelopeRow, Array<string | number>>(
					`
						SELECT e.* FROM events_fts f
						JOIN events e ON e._rowid = f.rowid
						LEFT JOIN event_contexts c ON c.event_id = e.id
						WHERE ${clauses.join(" AND ")}
						ORDER BY bm25(events_fts), e.created_at DESC
						LIMIT ?
					`,
				)
				.all(...params);

			return hydrateEvents(db, envelopes);
		},
		async getUnprocessedEvents(limit?: number) {
			const cutoff = nowUnix() - INTEL_VISIBILITY_TIMEOUT_SECONDS;
			const envelopes = orm
				.select()
				.from(eventsTable)
				.where(
					and(
						isNull(eventsTable.processed_at),
						or(isNull(eventsTable.started_at), lte(eventsTable.started_at, cutoff)),
					),
				)
				.orderBy(asc(eventsTable.created_at), asc(eventsTable._rowid))
				.limit(clampLimit(limit))
				.all();

			return hydrateEvents(db, envelopes);
		},
		async markStarted(id: string) {
			orm.update(eventsTable).set({ started_at: nowUnix() }).where(eq(eventsTable.id, id)).run();
		},
		async markProcessed(id: string) {
			orm
				.update(eventsTable)
				.set({ processed_at: nowUnix(), started_at: null })
				.where(eq(eventsTable.id, id))
				.run();
		},
	};
}
