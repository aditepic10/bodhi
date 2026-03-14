import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BodhiConfig } from "@bodhi/types";

import type { CliRuntime, HealthResponse, StatusSnapshot, WritableLike } from "./types";

type RuntimeHealthProbe = Pick<CliRuntime, "isProcessAlive" | "requestJson" | "sleep">;

export const START_TIMEOUT_MS = 5_000;
export const STOP_TIMEOUT_MS = 5_000;
export const POLL_INTERVAL_MS = 100;
export const HELP_TEXT = `bodhi [--resume <session-id>] [command]

Commands:
  bodhi
  bodhi --resume <session-id>
  bodhi init [--assistant-scope global|project|none]
  bodhi start
  bodhi stop
  bodhi status
  bodhi sessions
  bodhi recall "query"`;

export function writeLine(output: WritableLike, value = ""): void {
	output.write(`${value}\n`);
}

export function readRecentLogLines(path: string, limit = 20): string[] {
	if (!existsSync(path)) {
		return [];
	}

	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.slice(-limit);
}

export function configPathFor(config: BodhiConfig): string {
	return join(config.config_dir, "config.toml");
}

export function dbPathFor(config: BodhiConfig): string {
	return join(config.data_dir, "bodhi.db");
}

export function pidPathFor(config: BodhiConfig): string {
	return join(config.data_dir, "bodhi.pid");
}

export function readPid(config: BodhiConfig): number | null {
	const pidPath = pidPathFor(config);
	if (!existsSync(pidPath)) {
		return null;
	}

	const value = Number(readFileSync(pidPath, "utf8").trim());
	return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUptime(seconds: number): string {
	if (seconds < 60) {
		return `${Math.floor(seconds)}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
	}
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function formatTimestamp(value: number | null): string {
	return value ? new Date(value * 1000).toISOString() : "never";
}

export function renderDefaultConfigToml(config: BodhiConfig): string {
	return [
		`transport = "${config.transport}"`,
		`socket_path = "${config.socket_path}"`,
		`data_dir = "${config.data_dir}"`,
		`log_level = "${config.log_level}"`,
		"",
		"[capture]",
		`level = "${config.capture.level}"`,
		"",
		"[intel]",
		`auto_approve = ${config.intel.auto_approve ? "true" : "false"}`,
		`max_daily_extractions = ${config.intel.max_daily_extractions}`,
		"",
		"[intel.model]",
		`provider = "${config.intel.model.provider}"`,
		`model = "${config.intel.model.model}"`,
		"",
		"[agent]",
		`max_output_tokens = ${config.agent.max_output_tokens}`,
		"",
		"[conversations]",
		`max_sessions = ${config.conversations.max_sessions}`,
		"",
		"[rate_limits]",
		`agent_per_minute = ${config.rate_limits.agent_per_minute}`,
		`agent_per_hour = ${config.rate_limits.agent_per_hour}`,
		`events_per_minute = ${config.rate_limits.events_per_minute}`,
		`facts_per_minute = ${config.rate_limits.facts_per_minute}`,
		"",
		"[pipeline]",
		`fail_closed_redaction = ${config.pipeline.fail_closed_redaction ? "true" : "false"}`,
		"",
	].join("\n");
}

export function ensureCliConfigDirs(config: BodhiConfig): void {
	mkdirSync(config.config_dir, { mode: 0o700, recursive: true });
	mkdirSync(config.data_dir, { mode: 0o700, recursive: true });
}

export function readStatusSnapshot(config: BodhiConfig): StatusSnapshot {
	const dbPath = dbPathFor(config);
	if (!existsSync(dbPath)) {
		return {
			dbSizeBytes: 0,
			eventCount: 0,
			lastEventAt: null,
			pendingFacts: 0,
		};
	}

	const db = new Database(dbPath, { readonly: true });
	try {
		const eventCount =
			db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM events").get()?.count ?? 0;
		const lastEventAt =
			db
				.query<{ created_at: number | null }, []>(
					"SELECT MAX(created_at) AS created_at FROM events",
				)
				.get()?.created_at ?? null;
		const pendingFacts =
			db
				.query<{ count: number }, []>(
					"SELECT COUNT(*) AS count FROM facts WHERE status = 'pending' AND valid_to IS NULL",
				)
				.get()?.count ?? 0;

		return {
			dbSizeBytes: statSync(dbPath).size,
			eventCount,
			lastEventAt,
			pendingFacts,
		};
	} finally {
		db.close();
	}
}

export async function waitForHealth(
	runtime: RuntimeHealthProbe,
	config: BodhiConfig,
	pid?: number,
): Promise<HealthResponse> {
	const deadline = Date.now() + START_TIMEOUT_MS;
	let lastError: string | null = null;
	while (Date.now() < deadline) {
		if (pid && !runtime.isProcessAlive(pid)) {
			break;
		}

		try {
			const response = await runtime.requestJson<HealthResponse>(config, "/health", {
				authenticated: false,
			});
			if (response.status === 200 || response.status === 503) {
				return response.body;
			}
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await runtime.sleep(POLL_INTERVAL_MS);
	}

	throw new Error(lastError ?? "daemon failed to become healthy");
}
