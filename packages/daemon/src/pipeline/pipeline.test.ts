import { describe, expect, test } from "bun:test";

import { createPipeline } from "./pipeline";

describe("pipeline workflows", () => {
	test("invalid event is dropped by validation", () => {
		const pipeline = createPipeline({
			enrich: { machineId: "test-machine" },
		});

		const result = pipeline.process({
			type: "not.a.real.event",
			metadata: {},
		} as never);

		expect(result).toBeNull();
	});

	test("valid event is enriched deterministically", () => {
		const pipeline = createPipeline({
			enrich: { machineId: "machine-123" },
		});

		const result = pipeline.process({
			event_id: "evt-1",
			type: "shell.command.started",
			metadata: {
				command: "git status",
				cwd: "/tmp",
			},
			schema_version: 1,
		});

		expect(result).not.toBeNull();
		expect(result?.machine_id).toBe("machine-123");
		expect(result?.session_id).toBe("evt-1");
		expect(result?.schema_version).toBe(1);
	});
});
