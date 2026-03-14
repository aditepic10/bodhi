import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildOpenCodePlugin,
	installOpenCodePlugin,
	mapOpenCodeCapturePayload,
	readOpenCodePlugin,
	uninstallOpenCodePlugin,
} from "./opencode";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "bodhi-opencode-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("opencode capture", () => {
	test("plugin install is idempotent and uninstall removes only the Bodhi plugin file", () => {
		const root = makeTempDir();
		const pluginPath = join(root, "plugins", "bodhi.ts");

		installOpenCodePlugin(pluginPath);
		installOpenCodePlugin(pluginPath);
		const installed = readOpenCodePlugin(pluginPath);
		uninstallOpenCodePlugin(pluginPath);

		expect(installed).toContain("Bun.spawn(command,");
		expect(existsSync(pluginPath)).toBe(false);
	});

	test("generated plugin listens for prompt and tool events", () => {
		const plugin = buildOpenCodePlugin();

		expect(plugin).toContain("event: async ({ event }) =>");
		expect(plugin).toContain('"tool.execute.after"');
		expect(plugin).toContain('kind: "prompt"');
		expect(plugin).toContain('kind: "tool_call"');
	});

	test("maps canonical prompt payloads into ai.prompt", () => {
		const events = mapOpenCodeCapturePayload({
			cwd: process.cwd(),
			event_key: "message-1",
			kind: "prompt",
			prompt: "summarize what I was doing",
			session_id: "opencode-session-1",
		});

		expect(events).toHaveLength(1);
		const event = events[0];
		if (!event || event.type !== "ai.prompt") {
			throw new Error("expected ai.prompt");
		}

		expect(event.metadata.content).toBe("summarize what I was doing");
		expect(event.context?.tool).toBe("opencode");
		expect(event.context?.thread_id).toBe("opencode-session-1");
	});

	test("maps canonical tool payloads into ai.tool_call", () => {
		const events = mapOpenCodeCapturePayload({
			cwd: process.cwd(),
			description: "update retrieval filters",
			event_key: "tool-1",
			kind: "tool_call",
			session_id: "opencode-session-2",
			target: "packages/daemon/src/retrieval/planner.ts",
			tool_name: "Edit",
		});

		expect(events).toHaveLength(1);
		const event = events[0];
		if (!event || event.type !== "ai.tool_call") {
			throw new Error("expected ai.tool_call");
		}

		expect(event.metadata.tool_name).toBe("Edit");
		expect(event.metadata.target).toBe("packages/daemon/src/retrieval/planner.ts");
		expect(event.metadata.description).toBe("update retrieval filters");
	});

	test("invalid payloads fail closed", () => {
		const events = mapOpenCodeCapturePayload({
			kind: "prompt",
		});

		expect(events).toEqual([]);
	});
});
