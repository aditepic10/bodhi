import type { BodhiConfig } from "@bodhi/types";

export interface WritableLike {
	write(chunk: string): void;
}

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
	[key: string]: JsonValue | undefined;
}

export interface HealthResponse {
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

export interface StatusSnapshot {
	dbSizeBytes: number;
	eventCount: number;
	lastEventAt: number | null;
	pendingFacts: number;
}

export interface RequestOptions<TBody extends JsonValue = JsonObject> {
	authenticated?: boolean;
	body?: TBody;
	method?: "GET" | "POST";
}

export interface JsonResponse<TBody = unknown> {
	body: TBody;
	status: number;
}

export interface SseRequestOptions {
	signal?: AbortSignal;
}

export interface CliLineReader {
	close(): void;
	readLine(prompt: string): Promise<string | null>;
}

export interface CliRuntime {
	argv: readonly string[];
	commandExists(command: string): boolean;
	createLineReader(): CliLineReader;
	cwd(): string;
	isProcessAlive(pid: number): boolean;
	loadConfig(overrides?: Record<string, unknown>): BodhiConfig;
	onSignal(signal: NodeJS.Signals, handler: () => void): () => void;
	readStdin(): Promise<string>;
	requestJson<TResponse = unknown, TBody extends JsonValue = JsonObject>(
		config: BodhiConfig,
		path: string,
		options?: RequestOptions<TBody>,
	): Promise<JsonResponse<TResponse>>;
	requestSse(
		config: BodhiConfig,
		path: string,
		body: JsonObject,
		onEvent: (payload: JsonObject) => void,
		options?: SseRequestOptions,
	): Promise<void>;
	sleep(ms: number): Promise<void>;
	signalProcess(pid: number, signal: NodeJS.Signals): void;
	spawnDaemon(config: BodhiConfig): {
		pid: number | undefined;
		startupLogPath?: string;
		unref(): void;
	};
	stderr: WritableLike;
	stdout: WritableLike;
}
