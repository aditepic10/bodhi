import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BodhiConfigSchema, type CaptureSource } from "@bodhi/types";

import { createApiApp } from "./api/server";
import { startDaemon } from "./daemon";
import {
	applyPragmas,
	createStore,
	ensureCoreSchema,
	openDatabase,
	setupFts,
} from "./store/sqlite";
import { makeEvent, resetLLMStubs, stubLLMResponse, waitForEvent } from "./test-utils";

const tempDirs: string[] = [];
const runningDaemons: Array<Awaited<ReturnType<typeof startDaemon>>> = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "bodhi-daemon-"));
	tempDirs.push(dir);
	return dir;
}

function createStubServerFactory() {
	return (...args: Parameters<typeof createApiApp>) => {
		const { app, api } = createApiApp(...args);
		writeFileSync(api.config.socket_path, "");
		return {
			api,
			app,
			async stop() {},
			url: `unix:${api.config.socket_path}`,
		};
	};
}

afterEach(async () => {
	resetLLMStubs();
	for (const daemon of runningDaemons.splice(0)) {
		await daemon.shutdown();
	}
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("daemon orchestration workflows", () => {
	test("ingest flows into intel extraction and shutdown cleans pid/socket + capture sources", async () => {
		stubLLMResponse('[{"key":"preferred_editor","value":"vim","confidence":0.93}]');

		const dataDir = makeTempDir();
		let startCount = 0;
		let stopCount = 0;
		const captureSource: CaptureSource = {
			eventTypes: ["shell.command.executed"],
			name: "test-capture",
			async start() {
				startCount += 1;
			},
			async stop() {
				stopCount += 1;
			},
		};
		const daemon = await startDaemon({
			captureSources: [captureSource],
			config: {
				config_dir: dataDir,
				data_dir: dataDir,
				socket_path: join(dataDir, "bodhi.sock"),
			},
			spoolDrainIntervalMs: 25,
			startServer: createStubServerFactory(),
		});
		runningDaemons.push(daemon);

		const factPromise = waitForEvent(daemon.bus, "fact:extracted", 1500);
		const ingest = await daemon.server.app.request("http://localhost/events", {
			body: JSON.stringify(
				makeEvent({
					event_id: "evt-daemon-1",
					metadata: {
						command: "git config --global core.editor vim",
						cwd: "/tmp",
						duration_ms: 22,
						exit_code: 0,
					},
				}),
			),
			headers: {
				"content-type": "application/json",
			},
			method: "POST",
		});
		const fact = await factPromise;
		const healthResponse = await daemon.server.app.request("http://localhost/health");
		const health = (await healthResponse.json()) as {
			components: {
				intel: string;
			};
		};

		expect(ingest.status).toBe(200);
		expect(fact).toMatchObject({
			created_by: "intel",
			key: "preferred_editor",
			value: "vim",
		});
		expect(health.components.intel).toBe("healthy");
		expect(startCount).toBe(1);
		expect(existsSync(join(dataDir, "bodhi.pid"))).toBe(true);
		expect(existsSync(join(dataDir, "bodhi.sock"))).toBe(true);

		await daemon.shutdown();
		runningDaemons.splice(runningDaemons.indexOf(daemon), 1);

		expect(stopCount).toBe(1);
		expect(existsSync(join(dataDir, "bodhi.pid"))).toBe(false);
		expect(existsSync(join(dataDir, "bodhi.sock"))).toBe(false);
	});

	test("periodic spool drain replays events while the daemon is already running", async () => {
		stubLLMResponse('[{"key":"current_project","value":"bodhi","confidence":0.9}]');

		const dataDir = makeTempDir();
		const daemon = await startDaemon({
			config: {
				config_dir: dataDir,
				data_dir: dataDir,
				socket_path: join(dataDir, "bodhi.sock"),
			},
			spoolDrainIntervalMs: 25,
			startServer: createStubServerFactory(),
		});
		runningDaemons.push(daemon);

		const spoolPath = join(dataDir, "spool.321.jsonl");
		const storedPromise = waitForEvent(daemon.bus, "event:stored", 1500);
		const factPromise = waitForEvent(daemon.bus, "fact:extracted", 1500);
		writeFileSync(
			spoolPath,
			`${JSON.stringify(
				makeEvent({
					event_id: "evt-spooled-1",
					metadata: {
						command: "cd /Users/aditpareek/Documents/bodhi",
						cwd: "/tmp",
						duration_ms: 1,
						exit_code: 0,
					},
				}),
			)}\n`,
		);

		const stored = await storedPromise;
		const fact = await factPromise;

		expect(stored.event_id).toBe("evt-spooled-1");
		expect(fact).toMatchObject({
			key: "current_project",
			value: "bodhi",
		});
		expect(existsSync(spoolPath)).toBe(false);
	});

	test("startup prunes conversations beyond the configured max session count", async () => {
		const dataDir = makeTempDir();
		const config = BodhiConfigSchema.parse({
			config_dir: dataDir,
			data_dir: dataDir,
			socket_path: join(dataDir, "bodhi.sock"),
			conversations: {
				max_sessions: 1,
			},
		});
		const db = openDatabase(join(dataDir, "bodhi.db"));
		applyPragmas(db);
		ensureCoreSchema(db);
		setupFts(db);
		const store = createStore(db, {
			autoApprove: config.intel.auto_approve,
		});

		await store.appendMessage("user", "one", "session-1");
		await Bun.sleep(5);
		await store.appendMessage("user", "two", "session-2");
		await Bun.sleep(5);
		await store.appendMessage("user", "three", "session-3");
		store.close();

		const daemon = await startDaemon({
			config,
			spoolDrainIntervalMs: 25,
			startServer: createStubServerFactory(),
		});
		runningDaemons.push(daemon);

		const sessionCount = daemon.store.db
			.query<{ count: number }, []>(`SELECT COUNT(DISTINCT session_id) AS count FROM conversations`)
			.get();

		expect(sessionCount?.count).toBe(1);
	});
});
