import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	installClaudeCodeHooks,
	mapClaudeHookPayload,
	uninstallClaudeCodeHooks,
} from "./claude-code";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "bodhi-claude-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("claude code capture", () => {
	test("install is idempotent and uninstall preserves non-Bodhi hooks", () => {
		const root = makeTempDir();
		const settingsPath = join(root, "settings.json");
		writeFileSync(
			settingsPath,
			JSON.stringify(
				{
					hooks: {
						PostToolUse: [
							{
								hooks: [{ command: "echo existing", type: "command" }],
								matcher: "*",
							},
						],
					},
				},
				null,
				2,
			),
		);

		installClaudeCodeHooks(settingsPath);
		installClaudeCodeHooks(settingsPath);
		const installed = readFileSync(settingsPath, "utf8");
		uninstallClaudeCodeHooks(settingsPath);
		const removed = readFileSync(settingsPath, "utf8");

		expect(installed.match(/internal ai-capture claude-code/g)?.length).toBe(2);
		expect(installed).toContain(">/dev/null 2>&1 || true");
		expect(removed).toContain("echo existing");
		expect(removed).not.toContain("internal ai-capture claude-code");
	});

	test("maps prompt hooks into ai.prompt without transcript storage", () => {
		const events = mapClaudeHookPayload({
			cwd: process.cwd(),
			hook_event_name: "UserPromptSubmit",
			prompt: "explain the retrieval service",
			session_id: "claude-session-1",
			transcript_path: "/tmp/transcript.jsonl",
		});

		expect(events).toHaveLength(1);
		const event = events[0];
		if (!event || event.type !== "ai.prompt") {
			throw new Error("expected ai.prompt");
		}

		expect(event.metadata.content).toBe("explain the retrieval service");
		expect(event.context?.tool).toBe("claude-code");
		expect(event.context?.thread_id).toBe("claude-session-1");
		expect(JSON.stringify(event)).not.toContain("transcript.jsonl");
	});

	test("maps tool hooks into ai.tool_call with extracted target", () => {
		const events = mapClaudeHookPayload({
			cwd: process.cwd(),
			hook_event_name: "PostToolUse",
			session_id: "claude-session-2",
			tool_input: {
				file_path: "packages/daemon/src/retrieval/service.ts",
			},
			tool_name: "Edit",
		});

		expect(events).toHaveLength(1);
		const event = events[0];
		if (!event || event.type !== "ai.tool_call") {
			throw new Error("expected ai.tool_call");
		}

		expect(event.metadata.tool_name).toBe("Edit");
		expect(event.metadata.target).toBe("packages/daemon/src/retrieval/service.ts");
		expect(event.context?.thread_id).toBe("claude-session-2");
	});

	test("invalid payloads fail closed", () => {
		const events = mapClaudeHookPayload({
			hook_event_name: "UserPromptSubmit",
			session_id: "missing-cwd",
		});

		expect(events).toEqual([]);
	});
});
