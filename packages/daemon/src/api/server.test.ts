import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BodhiConfigSchema } from "@bodhi/types";

import {
	createTestBus,
	createTestPipeline,
	createTestStore,
	makeEvent,
	resetLLMStubs,
	stubLLMResponse,
	waitForEvent,
} from "../test-utils";
import { createApiApp, createServeConfig } from "./server";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "bodhi-api-"));
	tempDirs.push(dir);
	return dir;
}

function createApiFixture(overrides: Partial<Parameters<typeof BodhiConfigSchema.parse>[0]> = {}) {
	const dataDir = makeTempDir();
	const config = BodhiConfigSchema.parse({
		config_dir: dataDir,
		data_dir: dataDir,
		socket_path: join(dataDir, "bodhi.sock"),
		...overrides,
	});
	const store = createTestStore(config);
	const bus = createTestBus();
	const pipeline = createTestPipeline(config.pipeline);
	return {
		...createApiApp(
			{
				authToken: "test-token",
				bus,
				config,
				log: consoleLogger,
				pipeline,
				store,
			},
			{
				getDiskFreeMb: () => 2048,
				getIntelHealth: () => ({
					circuitBreaker: "closed",
					enabled: false,
					queueDepth: 0,
					queueMax: 1000,
				}),
				getSpoolFileCount: () => 0,
			},
		),
		config,
		store,
		bus,
	};
}

const consoleLogger = {
	debug() {},
	info() {},
	warn() {},
	error() {},
};

afterEach(() => {
	resetLLMStubs();
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("api server workflows", () => {
	test("health reports component-level status without auth in unix mode", async () => {
		const { app } = createApiFixture();

		const response = await app.request("http://localhost/health");
		const body = (await response.json()) as {
			ok: boolean;
			components: {
				store: string;
				intel: string;
				queue: { max: number };
				disk_free_mb: number;
			};
		};

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.components.store).toBe("healthy");
		expect(body.components.intel).toBe("disabled");
		expect(body.components.queue.max).toBe(1000);
		expect(body.components.disk_free_mb).toBe(2048);
	});

	test("health reports degraded intel when the circuit breaker is open", async () => {
		const dataDir = makeTempDir();
		const config = BodhiConfigSchema.parse({
			config_dir: dataDir,
			data_dir: dataDir,
			socket_path: join(dataDir, "bodhi.sock"),
		});
		const { app } = createApiApp(
			{
				authToken: "test-token",
				bus: createTestBus(),
				config,
				log: consoleLogger,
				pipeline: createTestPipeline(config.pipeline),
				store: createTestStore(config),
			},
			{
				getDiskFreeMb: () => 2048,
				getIntelHealth: () => ({
					circuitBreaker: "open",
					enabled: true,
					queueDepth: 5,
					queueMax: 1000,
				}),
				getSpoolFileCount: () => 2,
			},
		);

		const response = await app.request("http://localhost/health");
		const body = (await response.json()) as {
			components: {
				intel: string;
				circuit_breaker: string;
				queue: { depth: number };
				spool_files: number;
			};
		};

		expect(response.status).toBe(200);
		expect(body.components.intel).toBe("degraded");
		expect(body.components.circuit_breaker).toBe("open");
		expect(body.components.queue.depth).toBe(5);
		expect(body.components.spool_files).toBe(2);
	});

	test("tcp mode requires bearer auth for ingest but not health", async () => {
		const { app } = createApiFixture({
			transport: "tcp",
		});

		const health = await app.request("http://localhost/health");
		expect(health.status).toBe(200);

		const unauthorized = await app.request("http://localhost/events", {
			body: JSON.stringify(makeEvent()),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		expect(unauthorized.status).toBe(401);

		const authorized = await app.request("http://localhost/events", {
			body: JSON.stringify(makeEvent()),
			headers: {
				authorization: "Bearer test-token",
				"content-type": "application/json",
			},
			method: "POST",
		});
		expect(authorized.status).toBe(200);
	});

	test("ingest stores a redacted event, emits bus notifications, and stays idempotent", async () => {
		const { app, bus, store } = createApiFixture();
		const event = makeEvent({
			event_id: "evt-api-1",
			metadata: {
				command: "export AWS_SECRET_ACCESS_KEY=AKIASECRET123456789",
				cwd: "/tmp",
				duration_ms: 12,
				exit_code: 0,
			},
		});

		const storedEventPromise = waitForEvent(bus, "event:stored");
		const first = await app.request("http://localhost/events", {
			body: JSON.stringify(event),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		const stored = await storedEventPromise;
		const second = await app.request("http://localhost/events", {
			body: JSON.stringify(event),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});

		const events = await store.getEvents();

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(stored.type).toBe("shell.command.executed");
		if (stored.type !== "shell.command.executed") {
			throw new Error(`unexpected event type: ${stored.type}`);
		}
		expect(stored.metadata.command).toContain("[REDACTED]");
		expect(events).toHaveLength(1);
		expect(events[0]?.event_id).toBe("evt-api-1");
	});

	test("oversized request bodies are rejected before route handling", async () => {
		const { app } = createApiFixture();
		const command = "x".repeat(70_000);

		const response = await app.request("http://localhost/events", {
			body: JSON.stringify(
				makeEvent({
					event_id: "evt-large",
					metadata: {
						command,
						cwd: "/tmp",
						duration_ms: 1,
						exit_code: 0,
					},
				}),
			),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});

		expect(response.status).toBe(413);
	});

	test("facts POST assigns created_by on the server and GET defaults to active facts", async () => {
		const { app } = createApiFixture();

		const create = await app.request("http://localhost/facts", {
			body: JSON.stringify({
				created_by: "user",
				key: "preferred_editor",
				status: "rejected",
				value: "neovim",
			}),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		const created = (await create.json()) as {
			created_by: string;
			status: string;
		};
		const list = await app.request("http://localhost/facts");
		const body = (await list.json()) as {
			facts: Array<{ key: string }>;
		};

		expect(create.status).toBe(201);
		expect(created.created_by).toBe("api");
		expect(created.status).toBe("active");
		expect(body.facts).toHaveLength(1);
		expect(body.facts[0]?.key).toBe("preferred_editor");
	});

	test("query returns matching stored events with provenance fields", async () => {
		const { app } = createApiFixture();

		await app.request("http://localhost/events", {
			body: JSON.stringify(
				makeEvent({
					event_id: "evt-query-1",
					metadata: {
						command: "git status",
						cwd: "/tmp/project",
						duration_ms: 15,
						exit_code: 0,
					},
				}),
			),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		await app.request("http://localhost/events", {
			body: JSON.stringify(
				makeEvent({
					event_id: "evt-query-2",
					metadata: {
						command: "ls -la",
						cwd: "/tmp/project",
						duration_ms: 7,
						exit_code: 0,
					},
				}),
			),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});

		const response = await app.request("http://localhost/query", {
			body: JSON.stringify({
				query: "git",
			}),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		const body = (await response.json()) as {
			results: Array<{
				event_id: string;
				schema_version: number;
				source: string;
				type: string;
				metadata: {
					command: string;
				};
			}>;
		};

		expect(response.status).toBe(200);
		expect(body.results).toHaveLength(1);
		expect(body.results[0]?.event_id).toBe("evt-query-1");
		expect(body.results[0]?.type).toBe("shell.command.executed");
		expect(body.results[0]?.schema_version).toBe(1);
		expect(body.results[0]?.source).toBe("shell");
		expect(body.results[0]?.metadata.command).toBe("git status");
	});

	test("agent route returns 503 when no language model is configured", async () => {
		const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
		const originalOpenAiKey = process.env.OPENAI_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;

		try {
			const { app } = createApiFixture();

			const response = await app.request("http://localhost/agent", {
				body: JSON.stringify({
					message: "What commands have I run?",
				}),
				headers: {
					"content-type": "application/json",
				},
				method: "POST",
			});
			const body = (await response.json()) as {
				code: string;
				error: string;
			};

			expect(response.status).toBe(503);
			expect(body.code).toBe("NO_API_KEY");
			expect(body.error).toBe("API key not configured");
		} finally {
			if (originalAnthropicKey === undefined) {
				delete process.env.ANTHROPIC_API_KEY;
			} else {
				process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
			}

			if (originalOpenAiKey === undefined) {
				delete process.env.OPENAI_API_KEY;
			} else {
				process.env.OPENAI_API_KEY = originalOpenAiKey;
			}
		}
	});

	test("agent route streams SSE text deltas when the language model is stubbed", async () => {
		stubLLMResponse("Based on memory, you recently ran git status.");
		const { app, store } = createApiFixture();

		const response = await app.request("http://localhost/agent", {
			body: JSON.stringify({
				message: "What commands have I run recently?",
				session_id: "agent-session-1",
			}),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(body).toContain('"type":"text-delta"');
		expect(body).toContain("Based on memory, you recently ran git status.");
		expect(body).toContain('"type":"finish"');
		expect(body).toContain('"session_id":"agent-session-1"');
		expect((await store.getConversation("agent-session-1")).map((entry) => entry.role)).toEqual([
			"user",
			"assistant",
		]);
	});

	test("serve config disables idle timeouts for both unix and tcp transports", () => {
		const unixConfig = BodhiConfigSchema.parse({
			config_dir: "/tmp/bodhi-unix",
			data_dir: "/tmp/bodhi-unix",
			socket_path: "/tmp/bodhi-unix/bodhi.sock",
			transport: "unix",
		});
		const tcpConfig = BodhiConfigSchema.parse({
			config_dir: "/tmp/bodhi-tcp",
			data_dir: "/tmp/bodhi-tcp",
			host: "127.0.0.1",
			port: 4312,
			socket_path: "/tmp/unused.sock",
			transport: "tcp",
		});

		const unixServeConfig = createServeConfig(unixConfig);
		const tcpServeConfig = createServeConfig(tcpConfig);

		expect(unixServeConfig.idleTimeout).toBe(0);
		expect(unixServeConfig.transport).toBe("unix");
		if (unixServeConfig.transport !== "unix") {
			throw new Error("expected unix transport");
		}
		expect(unixServeConfig.socketPath).toBe("/tmp/bodhi-unix/bodhi.sock");

		expect(tcpServeConfig.idleTimeout).toBe(0);
		expect(tcpServeConfig.transport).toBe("tcp");
		if (tcpServeConfig.transport !== "tcp") {
			throw new Error("expected tcp transport");
		}
		expect(tcpServeConfig.port).toBe(4312);
		expect(tcpServeConfig.host).toBe("127.0.0.1");
	});

	test("facts rate limiting returns structured 429 responses", async () => {
		const { app } = createApiFixture({
			rate_limits: {
				agent_per_hour: 100,
				agent_per_minute: 10,
				events_per_minute: 1000,
				facts_per_minute: 1,
			},
		});

		const first = await app.request("http://localhost/facts", {
			body: JSON.stringify({
				key: "repo",
				value: "bodhi",
			}),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		const second = await app.request("http://localhost/facts", {
			body: JSON.stringify({
				key: "repo",
				value: "bodhi",
			}),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		const body = (await second.json()) as {
			code: string;
		};

		expect(first.status).toBe(201);
		expect(second.status).toBe(429);
		expect(body.code).toBe("RATE_LIMITED");
	});
});
