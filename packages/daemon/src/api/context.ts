import { Buffer } from "node:buffer";
import { readdirSync } from "node:fs";
import type { BodhiConfig } from "@bodhi/types";
import type { Context } from "hono";
import type { z } from "zod";

import type { EventBus } from "../bus";
import { getDiskFreeMb } from "../lifecycle";
import type { Logger } from "../logger";
import type { PipelineLike, SqliteStore } from "../store/sqlite";

export const MAX_JSON_BYTES = 64 * 1024;
const DEFAULT_INTEL_QUEUE_MAX = 1000;

export type CircuitBreakerState = "closed" | "open" | "half-open";
export type IntelHealthStatus = "healthy" | "degraded" | "disabled";

export interface IntelHealthSnapshot {
	enabled: boolean;
	queueDepth: number;
	queueMax: number;
	circuitBreaker: CircuitBreakerState;
}

export interface ApiContext {
	config: BodhiConfig;
	store: SqliteStore;
	pipeline: PipelineLike;
	bus: EventBus;
	log: Logger;
	authToken: string;
	startedAt: number;
	isCapturePaused(): boolean;
	getDiskFreeMb(): number;
	getSpoolFileCount(): number;
	getIntelHealth(): IntelHealthSnapshot;
}

export interface ApiContextOverrides {
	startedAt?: number;
	isCapturePaused?: () => boolean;
	getDiskFreeMb?: () => number;
	getSpoolFileCount?: () => number;
	getIntelHealth?: () => IntelHealthSnapshot;
}

function countSpoolFiles(dataDir: string): number {
	try {
		return readdirSync(dataDir).filter(
			(name) =>
				name.startsWith("spool.") && name.endsWith(".jsonl") && !name.includes(".draining."),
		).length;
	} catch {
		return 0;
	}
}

function hasProviderApiKey(config: BodhiConfig): boolean {
	if (config.intel.model.provider === "openai") {
		return Boolean(process.env.OPENAI_API_KEY);
	}

	return Boolean(process.env.ANTHROPIC_API_KEY);
}

function defaultIntelHealth(config: BodhiConfig): IntelHealthSnapshot {
	return {
		enabled: hasProviderApiKey(config),
		queueDepth: 0,
		queueMax: DEFAULT_INTEL_QUEUE_MAX,
		circuitBreaker: "closed",
	};
}

export function createApiContext(
	base: Omit<
		ApiContext,
		"startedAt" | "isCapturePaused" | "getDiskFreeMb" | "getSpoolFileCount" | "getIntelHealth"
	>,
	overrides: ApiContextOverrides = {},
): ApiContext {
	return {
		...base,
		startedAt: overrides.startedAt ?? Date.now(),
		isCapturePaused: overrides.isCapturePaused ?? (() => false),
		getDiskFreeMb: overrides.getDiskFreeMb ?? (() => getDiskFreeMb(base.config.data_dir)),
		getSpoolFileCount: overrides.getSpoolFileCount ?? (() => countSpoolFiles(base.config.data_dir)),
		getIntelHealth: overrides.getIntelHealth ?? (() => defaultIntelHealth(base.config)),
	};
}

export function jsonError(_c: Context, status: number, code: string, error: string): Response {
	return new Response(JSON.stringify({ error, code }), {
		headers: {
			"content-type": "application/json",
		},
		status,
	});
}

export async function parseJsonBody<T>(
	c: Context,
	schema: z.ZodType<T>,
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
	const raw = await c.req.raw.text();
	if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) {
		return {
			success: false,
			response: jsonError(c, 413, "BODY_TOO_LARGE", "request body exceeds 64KB"),
		};
	}

	let parsed: unknown;
	try {
		parsed = raw.length > 0 ? JSON.parse(raw) : {};
	} catch {
		return {
			success: false,
			response: jsonError(c, 400, "INVALID_JSON", "request body must be valid JSON"),
		};
	}

	const result = schema.safeParse(parsed);
	if (!result.success) {
		return {
			success: false,
			response: jsonError(c, 400, "INVALID_REQUEST", "request body failed validation"),
		};
	}

	return {
		success: true,
		data: result.data,
	};
}

export function resolveIntelStatus(snapshot: IntelHealthSnapshot): IntelHealthStatus {
	if (!snapshot.enabled) {
		return "disabled";
	}

	if (snapshot.circuitBreaker === "open") {
		return "degraded";
	}

	return "healthy";
}
