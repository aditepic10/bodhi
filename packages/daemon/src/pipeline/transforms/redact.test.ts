import { describe, expect, test } from "bun:test";

import { makeEvent } from "../../test-utils";
import { createPipeline } from "../pipeline";
import { createRedactTransform } from "./redact";

describe("redaction workflow", () => {
	test("event with AWS-style key is redacted before storage", () => {
		const pipeline = createPipeline({
			enrich: { machineId: "test-machine" },
		});
		const event = makeEvent({
			metadata: {
				command: "export AWS_SECRET_ACCESS_KEY=AKIA1234567890ABCDEF",
				exit_code: 0,
				duration_ms: 3,
				cwd: "/tmp",
			},
		});

		const result = pipeline.process(event);
		expect(result?.type).toBe("shell.command.executed");
		if (result?.type !== "shell.command.executed") {
			throw new Error("expected shell.command.executed");
		}
		expect(result.metadata.command).toContain("[REDACTED]");
		expect(result.metadata.command).not.toContain("AKIA1234567890ABCDEF");
	});

	test("keyword proximity redacts mysql password while preserving the command", () => {
		const pipeline = createPipeline({
			enrich: { machineId: "test-machine" },
		});
		const event = makeEvent({
			metadata: {
				command: "mysql -uroot -p'MyP@ssw0rd'",
				exit_code: 0,
				duration_ms: 4,
				cwd: "/tmp",
			},
		});

		const result = pipeline.process(event);
		if (result?.type !== "shell.command.executed") {
			throw new Error("expected shell.command.executed");
		}
		expect(result.metadata.command).toContain("mysql");
		expect(result.metadata.command).toContain("[REDACTED]");
		expect(result.metadata.command).not.toContain("MyP@ssw0rd");
	});

	test("false positives do not redact benign environment commands", () => {
		const pipeline = createPipeline({
			enrich: { machineId: "test-machine" },
		});
		const event = makeEvent({
			metadata: {
				command: "export PATH=/usr/local/bin",
				exit_code: 0,
				duration_ms: 2,
				cwd: "/tmp",
			},
		});

		const result = pipeline.process(event);
		if (result?.type !== "shell.command.executed") {
			throw new Error("expected shell.command.executed");
		}
		expect(result.metadata.command).toBe("export PATH=/usr/local/bin");
	});

	test("redaction fails closed when the scanner throws", () => {
		const redact = createRedactTransform({
			scan() {
				throw new Error("scanner exploded");
			},
		});
		const event = makeEvent();

		expect(redact(event)).toBeNull();
	});
});
