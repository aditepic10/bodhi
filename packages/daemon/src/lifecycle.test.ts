import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BodhiEvent } from "@bodhi/types";
import { BodhiConfigSchema } from "@bodhi/types";
import { drainSpool } from "./lifecycle";
import { createLogger } from "./logger";
import { createTestStore } from "./test-utils";

describe("lifecycle workflows", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const directory of tempDirs.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("spool files are drained through the pipeline and deleted", async () => {
		const store = createTestStore(BodhiConfigSchema.parse({}));
		const spoolDir = mkdtempSync(join(tmpdir(), "bodhi-spool-"));
		tempDirs.push(spoolDir);

		const spoolPath = join(spoolDir, "spool.123.jsonl");
		const duplicatePath = join(spoolDir, "spool.456.jsonl");

		const event = {
			event_id: "spool-1",
			type: "shell.command.executed",
			metadata: {
				command: "echo secret-token",
				exit_code: 0,
				duration_ms: 5,
				cwd: "/tmp",
			},
			schema_version: 1,
		};

		writeFileSync(spoolPath, `${JSON.stringify(event)}\n`);
		writeFileSync(duplicatePath, `${JSON.stringify(event)}\n`);

		const pipeline = {
			process(rawEvent: BodhiEvent) {
				if (rawEvent.type !== "shell.command.executed") {
					return rawEvent;
				}

				return {
					...rawEvent,
					metadata: {
						...rawEvent.metadata,
						command: rawEvent.metadata.command.replace("secret-token", "[REDACTED]"),
					},
				};
			},
		};

		const drained = await drainSpool(store, pipeline, spoolDir, createLogger("error"));
		const events = await store.getEvents({ limit: 10 });

		expect(drained).toBe(2);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("shell.command.executed");
		if (events[0]?.type !== "shell.command.executed") {
			throw new Error("expected shell.command.executed event");
		}
		expect(events[0].metadata.command).toContain("[REDACTED]");
		expect(Bun.file(spoolPath).exists()).resolves.toBe(false);
		expect(Bun.file(duplicatePath).exists()).resolves.toBe(false);

		store.close();
	});

	test("failed spool lines are preserved for retry instead of being deleted", async () => {
		const store = createTestStore(BodhiConfigSchema.parse({}));
		const spoolDir = mkdtempSync(join(tmpdir(), "bodhi-spool-"));
		tempDirs.push(spoolDir);

		const spoolPath = join(spoolDir, "spool.789.jsonl");
		const first = {
			event_id: "spool-preserve-1",
			type: "shell.command.executed",
			metadata: {
				command: "echo first",
				exit_code: 0,
				duration_ms: 5,
				cwd: "/tmp",
			},
			schema_version: 1,
		};
		const second = {
			event_id: "spool-preserve-2",
			type: "shell.command.executed",
			metadata: {
				command: "echo second",
				exit_code: 0,
				duration_ms: 5,
				cwd: "/tmp",
			},
			schema_version: 1,
		};

		writeFileSync(spoolPath, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);

		const originalAppendEvent = store.appendEvent.bind(store);
		store.appendEvent = async (event, source) => {
			if (event.event_id === "spool-preserve-1") {
				throw new Error("simulated append failure");
			}

			return originalAppendEvent(event, source);
		};

		const drained = await drainSpool(
			store,
			{
				process(event: BodhiEvent) {
					return event;
				},
			},
			spoolDir,
			createLogger("error"),
		);
		const replayed = readFileSync(spoolPath, "utf8");
		const events = await store.getEvents({ limit: 10 });

		expect(drained).toBe(1);
		expect(events).toHaveLength(1);
		expect(events[0]?.event_id).toBe("spool-preserve-2");
		expect(replayed).toContain("spool-preserve-1");
		expect(replayed).not.toContain("spool-preserve-2");
		expect(Bun.file(join(spoolDir, "spool.789.draining.jsonl")).exists()).resolves.toBe(false);

		store.close();
	});

	test("orphaned draining spool files are recovered on the next drain pass", async () => {
		const store = createTestStore(BodhiConfigSchema.parse({}));
		const spoolDir = mkdtempSync(join(tmpdir(), "bodhi-spool-"));
		tempDirs.push(spoolDir);

		const drainingPath = join(spoolDir, "spool.999.draining.jsonl");
		writeFileSync(
			drainingPath,
			`${JSON.stringify({
				event_id: "spool-recover-1",
				type: "shell.command.executed",
				metadata: {
					command: "echo recovered",
					exit_code: 0,
					duration_ms: 5,
					cwd: "/tmp",
				},
				schema_version: 1,
			})}\n`,
		);

		const drained = await drainSpool(
			store,
			{
				process(event: BodhiEvent) {
					return event;
				},
			},
			spoolDir,
			createLogger("error"),
		);
		const events = await store.getEvents({ limit: 10 });

		expect(drained).toBe(1);
		expect(events).toHaveLength(1);
		expect(events[0]?.event_id).toBe("spool-recover-1");
		expect(Bun.file(drainingPath).exists()).resolves.toBe(false);

		store.close();
	});
});
