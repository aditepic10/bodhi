import type { Database } from "bun:sqlite";
import type { BodhiEvent, FactCreatedBy, FactStatus, Store } from "@bodhi/types";

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;
export const INTEL_VISIBILITY_TIMEOUT_SECONDS = 5 * 60;

export type StoredEventRow = {
	id: string;
	event_id: string;
	type: string;
	metadata: string;
	source: string;
	session_id: string | null;
	machine_id: string | null;
	schema_version: number;
	producer_version: string | null;
	created_at: number;
	processed_at: number | null;
	started_at: number | null;
};

export type FactRow = {
	id: string;
	key: string;
	value: string;
	created_by: FactCreatedBy;
	source_event_id: string | null;
	status: FactStatus;
	confidence: number;
	schema_version: number;
	supersedes_fact_id: string | null;
	extraction_meta: string | null;
	valid_from: number | null;
	valid_to: number | null;
	created_at: number;
	updated_at: number;
};

export interface PipelineLike {
	process(event: BodhiEvent): BodhiEvent | null;
}

export interface SqliteStore extends Store {
	db: Database;
}

export interface CreateStoreOptions {
	autoApprove?: boolean;
}
