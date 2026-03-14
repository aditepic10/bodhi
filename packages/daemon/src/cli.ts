#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BodhiConfig } from "@bodhi/types";

import {
	defaultRcPath,
	detectShellDependencies,
	installShellHook,
	type SupportedShell,
} from "./capture/shell";
import { loadConfig } from "./config";

const START_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 100;
const HELP_TEXT = `bodhi <command>

Commands:
  bodhi init
  bodhi start
  bodhi stop
  bodhi status
  bodhi recall "query"`;

interface WritableLike {
	write(chunk: string): void;
}

interface HealthResponse {
	ok: boolean;
	uptime: number;
	components: {
		circuit_breaker: string;
		disk_free_mb: number;
		intel: string;
		queue: {
			depth: number;
			max: number;
		};
		spool_files: number;
		store: string;
	};
}

interface StatusSnapshot {
	dbSizeBytes: number;
	eventCount: number;
	lastEventAt: number | null;
	pendingFacts: number;
}

interface JsonResponse {
	body: unknown;
	status: number;
}

export interface CliRuntime {
	argv: readonly string[];
	commandExists(command: string): boolean;
	isProcessAlive(pid: number): boolean;
	loadConfig(overrides?: Record<string, unknown>): BodhiConfig;
	requestJson(
		config: BodhiConfig,
		path: string,
		options?: {
			authenticated?: boolean;
			body?: Record<string, unknown>;
			method?: "GET" | "POST";
		},
	): Promise<JsonResponse>;
	requestSse(
		config: BodhiConfig,
		path: string,
		body: Record<string, unknown>,
		onEvent: (payload: Record<string, unknown>) => void,
	): Promise<void>;
	sleep(ms: number): Promise<void>;
	signalProcess(pid: number, signal: NodeJS.Signals): void;
	spawnDaemon(): { pid: number | undefined; unref(): void };
	stderr: WritableLike;
	stdout: WritableLike;
}

function writeLine(output: WritableLike, value = ""): void {
	output.write(`${value}\n`);
}

function defaultCommandExists(command: string): boolean {
	return Bun.which(command) !== null;
}

function readAuthToken(config: BodhiConfig): string | null {
	const path = join(config.config_dir, "auth-token");
	if (!existsSync(path)) {
		return null;
	}

	return readFileSync(path, "utf8").trim();
}

function requestRaw(
	config: BodhiConfig,
	path: string,
	options: {
		authenticated?: boolean;
		body?: Record<string, unknown>;
		method?: "GET" | "POST";
	} = {},
): Promise<{ body: string; status: number }> {
	const method = options.method ?? "GET";
	const payload = options.body ? JSON.stringify(options.body) : undefined;
	const headers: Record<string, string> = {};
	if (payload) {
		headers["content-length"] = Buffer.byteLength(payload).toString();
		headers["content-type"] = "application/json";
	}

	if (options.authenticated !== false) {
		const authToken = readAuthToken(config);
		if (authToken) {
			headers.authorization = `Bearer ${authToken}`;
		}
	}

	return new Promise((resolve, reject) => {
		const request = httpRequest(
			config.transport === "unix"
				? {
						headers,
						method,
						path,
						socketPath: config.socket_path,
					}
				: {
						headers,
						host: config.host,
						method,
						path,
						port: config.port,
					},
			(response) => {
				let body = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("end", () => {
					resolve({
						body,
						status: response.statusCode ?? 0,
					});
				});
			},
		);

		request.on("error", reject);
		if (payload) {
			request.write(payload);
		}
		request.end();
	});
}

export async function requestJson(
	config: BodhiConfig,
	path: string,
	options?: {
		authenticated?: boolean;
		body?: Record<string, unknown>;
		method?: "GET" | "POST";
	},
): Promise<JsonResponse> {
	const response = await requestRaw(config, path, options);
	return {
		body: response.body.length > 0 ? JSON.parse(response.body) : null,
		status: response.status,
	};
}

export async function requestSse(
	config: BodhiConfig,
	path: string,
	body: Record<string, unknown>,
	onEvent: (payload: Record<string, unknown>) => void,
): Promise<void> {
	const payload = JSON.stringify(body);
	const headers: Record<string, string> = {
		"content-length": Buffer.byteLength(payload).toString(),
		"content-type": "application/json",
	};
	const authToken = readAuthToken(config);
	if (authToken) {
		headers.authorization = `Bearer ${authToken}`;
	}

	await new Promise<void>((resolve, reject) => {
		const request = httpRequest(
			config.transport === "unix"
				? {
						headers,
						method: "POST",
						path,
						socketPath: config.socket_path,
					}
				: {
						headers,
						host: config.host,
						method: "POST",
						path,
						port: config.port,
					},
			(response) => {
				if ((response.statusCode ?? 0) !== 200) {
					let bodyText = "";
					response.setEncoding("utf8");
					response.on("data", (chunk) => {
						bodyText += chunk;
					});
					response.on("end", () => {
						reject(new Error(`request failed (${response.statusCode ?? 0}): ${bodyText}`));
					});
					return;
				}

				let buffer = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					buffer += chunk;
					let boundary = buffer.indexOf("\n\n");
					while (boundary >= 0) {
						const frame = buffer.slice(0, boundary);
						buffer = buffer.slice(boundary + 2);
						for (const line of frame.split("\n")) {
							if (!line.startsWith("data: ")) {
								continue;
							}

							onEvent(JSON.parse(line.slice(6)) as Record<string, unknown>);
						}
						boundary = buffer.indexOf("\n\n");
					}
				});
				response.on("end", resolve);
			},
		);

		request.on("error", reject);
		request.write(payload);
		request.end();
	});
}

function createRuntime(): CliRuntime {
	const daemonEntry = fileURLToPath(new URL("./daemon.ts", import.meta.url));
	return {
		argv: process.argv.slice(2),
		commandExists: defaultCommandExists,
		isProcessAlive(pid: number) {
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		},
		loadConfig,
		requestJson,
		requestSse,
		sleep(ms: number) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		},
		signalProcess(pid: number, signal: NodeJS.Signals) {
			process.kill(pid, signal);
		},
		spawnDaemon() {
			const child = spawn(process.execPath, ["run", daemonEntry], {
				detached: true,
				env: process.env,
				stdio: "ignore",
			});
			return {
				pid: child.pid,
				unref() {
					child.unref();
				},
			};
		},
		stderr: process.stderr,
		stdout: process.stdout,
	};
}

function configPathFor(config: BodhiConfig): string {
	return join(config.config_dir, "config.toml");
}

function dbPathFor(config: BodhiConfig): string {
	return join(config.data_dir, "bodhi.db");
}

function pidPathFor(config: BodhiConfig): string {
	return join(config.data_dir, "bodhi.pid");
}

function readPid(config: BodhiConfig): number | null {
	const pidPath = pidPathFor(config);
	if (!existsSync(pidPath)) {
		return null;
	}

	const value = Number(readFileSync(pidPath, "utf8").trim());
	return Number.isFinite(value) && value > 0 ? value : null;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
	if (seconds < 60) {
		return `${Math.floor(seconds)}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
	}
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTimestamp(value: number | null): string {
	return value ? new Date(value * 1000).toISOString() : "never";
}

function renderDefaultConfigToml(config: BodhiConfig): string {
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

function readStatusSnapshot(config: BodhiConfig): StatusSnapshot {
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

async function waitForHealth(runtime: CliRuntime, config: BodhiConfig): Promise<HealthResponse> {
	const deadline = Date.now() + START_TIMEOUT_MS;
	let lastError: string | null = null;
	while (Date.now() < deadline) {
		try {
			const response = await runtime.requestJson(config, "/health", { authenticated: false });
			if (response.status === 200 || response.status === 503) {
				return response.body as HealthResponse;
			}
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await runtime.sleep(POLL_INTERVAL_MS);
	}

	throw new Error(lastError ?? "daemon failed to become healthy");
}

async function handleInit(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	const configPath = configPathFor(config);
	mkdirSync(config.config_dir, { mode: 0o700, recursive: true });
	mkdirSync(config.data_dir, { mode: 0o700, recursive: true });

	if (!existsSync(configPath)) {
		writeFileSync(configPath, renderDefaultConfigToml(config), { mode: 0o600 });
	}

	const dependencies = detectShellDependencies(runtime.commandExists);
	for (const shell of ["zsh", "bash"] as const satisfies readonly SupportedShell[]) {
		const rcPath = defaultRcPath(shell);
		installShellHook({
			dataDir: config.data_dir,
			rcPath,
			shell,
			socketPath: config.socket_path,
		});
		writeLine(runtime.stdout, `Installed ${shell} hook: ${rcPath}`);
	}

	writeLine(runtime.stdout, `Config: ${configPath}`);
	if (!dependencies.uuidgen) {
		writeLine(
			runtime.stderr,
			"Warning: uuidgen not found; shell hooks will use a weaker fallback id",
		);
	}
	if (!dependencies.jq) {
		writeLine(
			runtime.stderr,
			dependencies.python3
				? "Warning: jq not found; shell hooks will fall back to python3 JSON encoding"
				: "Warning: jq and python3 not found; shell capture cannot serialize events safely",
		);
	}

	return 0;
}

async function handleStart(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	const existingPid = readPid(config);
	if (existingPid && runtime.isProcessAlive(existingPid)) {
		const health = await waitForHealth(runtime, config);
		writeLine(runtime.stdout, `Bodhi already running (pid ${existingPid})`);
		writeLine(
			runtime.stdout,
			config.transport === "unix"
				? `Socket: ${config.socket_path}`
				: `Address: http://${config.host}:${config.port}`,
		);
		writeLine(runtime.stdout, `Intel: ${health.components.intel}`);
		return 0;
	}

	const child = runtime.spawnDaemon();
	child.unref();
	if (!child.pid) {
		throw new Error("failed to spawn daemon");
	}

	await waitForHealth(runtime, config);
	writeLine(runtime.stdout, `Bodhi started (pid ${child.pid})`);
	writeLine(
		runtime.stdout,
		config.transport === "unix"
			? `Socket: ${config.socket_path}`
			: `Address: http://${config.host}:${config.port}`,
	);
	return 0;
}

async function handleStop(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	const pid = readPid(config);
	if (!pid) {
		writeLine(runtime.stderr, "Bodhi is not running");
		return 1;
	}

	runtime.signalProcess(pid, "SIGTERM");
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (!runtime.isProcessAlive(pid)) {
			writeLine(runtime.stdout, `Bodhi stopped (pid ${pid})`);
			return 0;
		}
		await runtime.sleep(POLL_INTERVAL_MS);
	}

	throw new Error(`timed out waiting for pid ${pid} to exit`);
}

async function handleStatus(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	let health: HealthResponse;
	try {
		const response = await runtime.requestJson(config, "/health", { authenticated: false });
		health = response.body as HealthResponse;
	} catch {
		writeLine(runtime.stdout, "Status: stopped");
		return 1;
	}

	const snapshot = readStatusSnapshot(config);
	writeLine(runtime.stdout, `Status: ${health.ok ? "running" : "degraded"}`);
	writeLine(runtime.stdout, `Uptime: ${formatUptime(health.uptime)}`);
	writeLine(runtime.stdout, `Event count: ${snapshot.eventCount}`);
	writeLine(runtime.stdout, `DB size: ${formatBytes(snapshot.dbSizeBytes)}`);
	writeLine(runtime.stdout, `Last event: ${formatTimestamp(snapshot.lastEventAt)}`);
	writeLine(runtime.stdout, `Pending facts: ${snapshot.pendingFacts}`);
	writeLine(runtime.stdout, `Intel: ${health.components.intel}`);
	writeLine(runtime.stdout, `Spool files: ${health.components.spool_files}`);
	writeLine(runtime.stdout, `Disk free: ${health.components.disk_free_mb} MB`);
	return 0;
}

async function handleRecall(runtime: CliRuntime, args: readonly string[]): Promise<number> {
	const message = args.join(" ").trim();
	if (!message) {
		writeLine(runtime.stderr, 'Usage: bodhi recall "query"');
		return 1;
	}

	const config = runtime.loadConfig();
	await runtime.requestSse(config, "/agent", { message }, (payload) => {
		switch (payload.type) {
			case "text-delta":
				runtime.stdout.write(String(payload.text ?? ""));
				break;
			case "error":
				throw new Error(String(payload.error ?? "agent request failed"));
			default:
				break;
		}
	});
	writeLine(runtime.stdout);
	return 0;
}

export async function runCli(
	argv: readonly string[] = process.argv.slice(2),
	runtime: CliRuntime = createRuntime(),
): Promise<number> {
	const [command, ...args] = argv;
	switch (command) {
		case undefined:
		case "-h":
		case "--help":
		case "help":
			writeLine(runtime.stdout, HELP_TEXT);
			return 0;
		case "init":
			return handleInit(runtime);
		case "start":
			return handleStart(runtime);
		case "stop":
			return handleStop(runtime);
		case "status":
			return handleStatus(runtime);
		case "recall":
			return handleRecall(runtime, args);
		default:
			writeLine(runtime.stderr, `Unknown command: ${command}`);
			writeLine(runtime.stderr, HELP_TEXT);
			return 1;
	}
}

async function main(): Promise<void> {
	try {
		process.exit(await runCli());
	} catch (error) {
		writeLine(process.stderr, error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

if (import.meta.main) {
	await main();
}
