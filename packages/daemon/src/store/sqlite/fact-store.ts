import type { Database } from "bun:sqlite";
import type { Fact, FactFilter } from "@bodhi/types";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";

import { factsTable } from "../facts.sql";
import { nowUnix } from "../schema.sql";
import {
	clampLimit,
	mapFact,
	normalizeFactStatus,
	normalizeFtsQuery,
	withImmediateTransaction,
} from "./helpers";
import type { FactRow, SqliteStore } from "./types";

type FactStoreMethods = Pick<
	SqliteStore,
	"insertFact" | "updateFact" | "getFacts" | "searchFacts" | "invalidateFact"
>;

export function createFactStore(db: Database, autoApprove: boolean): FactStoreMethods {
	const orm = drizzle(db);

	return {
		async insertFact(fact: Omit<Fact, "id" | "created_at" | "updated_at">) {
			const id = nanoid();
			const timestamp = nowUnix();
			const status = normalizeFactStatus(fact.created_by, fact.status, autoApprove);

			withImmediateTransaction(db, () => {
				orm
					.insert(factsTable)
					.values({
						confidence: fact.confidence,
						created_at: timestamp,
						created_by: fact.created_by,
						extraction_meta: fact.extraction_meta ?? null,
						id,
						key: fact.key,
						schema_version: fact.schema_version,
						source_event_id: fact.source_event_id ?? null,
						status,
						supersedes_fact_id: fact.supersedes_fact_id ?? null,
						updated_at: timestamp,
						valid_from: fact.valid_from ?? null,
						valid_to: fact.valid_to ?? null,
						value: fact.value,
					})
					.run();
			});

			const row = orm.select().from(factsTable).where(eq(factsTable.id, id)).limit(1).get();
			if (!row) {
				throw new Error(`failed to insert fact ${id}`);
			}

			return mapFact(row);
		},
		async updateFact(id: string, updates: Partial<Fact>) {
			const existing = orm.select().from(factsTable).where(eq(factsTable.id, id)).limit(1).get();
			if (!existing) {
				throw new Error(`fact not found: ${id}`);
			}

			const merged = {
				...mapFact(existing),
				...updates,
				updated_at: nowUnix(),
			};

			orm
				.update(factsTable)
				.set({
					confidence: merged.confidence,
					created_by: merged.created_by,
					extraction_meta: merged.extraction_meta ?? null,
					key: merged.key,
					schema_version: merged.schema_version,
					source_event_id: merged.source_event_id ?? null,
					status: merged.status,
					supersedes_fact_id: merged.supersedes_fact_id ?? null,
					updated_at: merged.updated_at,
					valid_from: merged.valid_from ?? null,
					valid_to: merged.valid_to ?? null,
					value: merged.value,
				})
				.where(eq(factsTable.id, id))
				.run();

			const updated = orm.select().from(factsTable).where(eq(factsTable.id, id)).limit(1).get();
			if (!updated) {
				throw new Error(`failed to update fact ${id}`);
			}

			return mapFact(updated);
		},
		async getFacts(filter: FactFilter = {}) {
			const conditions = [
				filter.key ? eq(factsTable.key, filter.key) : undefined,
				filter.created_by ? eq(factsTable.created_by, filter.created_by) : undefined,
				eq(factsTable.status, filter.status ?? "active"),
				filter.active_only ? isNull(factsTable.valid_to) : undefined,
			].filter(Boolean);

			const rows =
				conditions.length > 0
					? orm
							.select()
							.from(factsTable)
							.where(and(...conditions))
							.orderBy(desc(factsTable.created_at), desc(factsTable._rowid))
							.limit(clampLimit(filter.limit))
							.all()
					: orm
							.select()
							.from(factsTable)
							.orderBy(desc(factsTable.created_at), desc(factsTable._rowid))
							.limit(clampLimit(filter.limit))
							.all();

			return rows.map(mapFact);
		},
		async searchFacts(query: string, limit?: number) {
			return db
				.query<FactRow, [string, number]>(
					`
						SELECT f.* FROM facts_fts x
						JOIN facts f ON f._rowid = x.rowid
						WHERE facts_fts MATCH ?
						AND f.status = 'active'
						ORDER BY bm25(facts_fts), f.created_at DESC
						LIMIT ?
					`,
				)
				.all(normalizeFtsQuery(query), clampLimit(limit))
				.map(mapFact);
		},
		async invalidateFact(id: string) {
			const timestamp = nowUnix();
			orm
				.update(factsTable)
				.set({ updated_at: timestamp, valid_to: timestamp })
				.where(eq(factsTable.id, id))
				.run();
		},
	};
}
