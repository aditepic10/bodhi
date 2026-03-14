import type { BodhiConfig } from "@bodhi/types";

export interface WritableLike {
	write(chunk: string): void;
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

export interface RequestOptions {
	authenticated?: boolean;
	body?: Record<string, unknown>;
	method?: "GET" | "POST";
}

export interface JsonResponse {
	body: unknown;
	status: number;
}

export interface CliRuntime {
	argv: readonly string[];
	commandExists(command: string): boolean;
	isProcessAlive(pid: number): boolean;
	loadConfig(overrides?: Record<string, unknown>): BodhiConfig;
	requestJson(config: BodhiConfig, path: string, options?: RequestOptions): Promise<JsonResponse>;
	requestSse(
		config: BodhiConfig,
		path: string,
		body: Record<string, unknown>,
		onEvent: (payload: Record<string, unknown>) => void,
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
