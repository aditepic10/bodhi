import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});
