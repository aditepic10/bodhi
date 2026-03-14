import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BodhiEvent } from "@bodhi/types";

import { deriveActivityContext } from "../../activity-context";
import type { AssistantCaptureAdapter } from "./adapters";
import { assistantCaptureCommand } from "./command";
import { globalClaudeSettingsPath, stableEventId } from "./helpers";
import { type ClaudeHookPayload, ClaudeHookPayloadSchema } from "./types";

const CLAUDE_TOOL = "claude-code";
const BODHI_CLAUDE_COMMAND = assistantCaptureCommand(CLAUDE_TOOL);

interface ClaudeHookEntry {
	hooks: Array<{
		command: string;
		type: "command";
	}>;
	matcher?: string;
}

interface ClaudeSettings {
	hooks?: Partial<Record<"PostToolUse" | "UserPromptSubmit", ClaudeHookEntry[]>>;
	[key: string]: unknown;
}

function extractString(
	input: Record<string, unknown> | undefined,
	keys: readonly string[],
): string | undefined {
	if (!input) {
		return undefined;
	}

	for (const key of keys) {
		const value = input[key];
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	return undefined;
}

function extractClaudeToolTarget(payload: ClaudeHookPayload): string | undefined {
	const toolInput = payload.tool_input;
	return extractString(toolInput, [
		"file_path",
		"path",
		"command",
		"pattern",
		"query",
		"url",
		"target",
	]);
}

function extractClaudeToolDescription(payload: ClaudeHookPayload): string | undefined {
	const toolInput = payload.tool_input;
	return extractString(toolInput, ["description", "prompt", "reason"]);
}

function readClaudeSettings(path: string): ClaudeSettings {
	if (!existsSync(path)) {
		return {};
	}

	return JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
}

function writeClaudeSettings(path: string, settings: ClaudeSettings): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

function upsertHookEntry(entries: ClaudeHookEntry[], matcher?: string): ClaudeHookEntry[] {
	const next = [...entries];
	const existing = next.find((entry) => (entry.matcher ?? "") === (matcher ?? ""));
	if (existing) {
		if (!existing.hooks.some((hook) => hook.command === BODHI_CLAUDE_COMMAND)) {
			existing.hooks.push({ command: BODHI_CLAUDE_COMMAND, type: "command" });
		}
		return next;
	}

	next.push({
		hooks: [{ command: BODHI_CLAUDE_COMMAND, type: "command" }],
		matcher,
	});
	return next;
}

function stripBodhiHooks(entries: ClaudeHookEntry[] | undefined): ClaudeHookEntry[] {
	if (!entries) {
		return [];
	}

	return entries
		.map((entry) => ({
			...entry,
			hooks: entry.hooks.filter((hook) => hook.command !== BODHI_CLAUDE_COMMAND),
		}))
		.filter((entry) => entry.hooks.length > 0);
}

export function installClaudeCodeHooks(settingsPath = globalClaudeSettingsPath()): void {
	const settings = readClaudeSettings(settingsPath);
	const hooks = settings.hooks ?? {};

	hooks.UserPromptSubmit = upsertHookEntry(hooks.UserPromptSubmit ?? []);
	hooks.PostToolUse = upsertHookEntry(hooks.PostToolUse ?? [], "*");

	settings.hooks = hooks;
	writeClaudeSettings(settingsPath, settings);
}

export function uninstallClaudeCodeHooks(settingsPath = globalClaudeSettingsPath()): void {
	const settings = readClaudeSettings(settingsPath);
	if (!settings.hooks) {
		return;
	}

	const nextHooks: ClaudeSettings["hooks"] = {};
	const postToolUse = stripBodhiHooks(settings.hooks.PostToolUse);
	const userPromptSubmit = stripBodhiHooks(settings.hooks.UserPromptSubmit);

	if (postToolUse.length > 0) {
		nextHooks.PostToolUse = postToolUse;
	}
	if (userPromptSubmit.length > 0) {
		nextHooks.UserPromptSubmit = userPromptSubmit;
	}

	if (Object.keys(nextHooks).length === 0) {
		delete settings.hooks;
	} else {
		settings.hooks = nextHooks;
	}

	writeClaudeSettings(settingsPath, settings);
}

export function mapClaudeHookPayload(input: unknown): BodhiEvent[] {
	const parsed = ClaudeHookPayloadSchema.safeParse(input);
	if (!parsed.success) {
		return [];
	}

	const payload = parsed.data;
	const context = deriveActivityContext(payload.cwd, CLAUDE_TOOL, payload.session_id);

	if (payload.hook_event_name === "UserPromptSubmit") {
		const content = payload.prompt?.trim();
		if (!content) {
			return [];
		}

		return [
			{
				context,
				event_id: stableEventId(),
				metadata: {
					content,
				},
				type: "ai.prompt",
			},
		];
	}

	const toolName = payload.tool_name?.trim();
	if (!toolName) {
		return [];
	}

	return [
		{
			context,
			event_id: stableEventId(),
			metadata: {
				description: extractClaudeToolDescription(payload),
				target: extractClaudeToolTarget(payload),
				tool_name: toolName,
			},
			type: "ai.tool_call",
		},
	];
}

function projectClaudeSettingsPath(cwd: string): string {
	return join(cwd, ".claude", "settings.local.json");
}

function resolveClaudeSettingsPath(scope: "global" | "project", cwd: string): string {
	return scope === "project" ? projectClaudeSettingsPath(cwd) : globalClaudeSettingsPath();
}

export const claudeCodeAdapter: AssistantCaptureAdapter = {
	defaultScope: "global",
	displayName: "Claude Code",
	install(scope, cwd) {
		const settingsPath = resolveClaudeSettingsPath(scope, cwd);
		installClaudeCodeHooks(settingsPath);
		return settingsPath;
	},
	mapPayload: mapClaudeHookPayload,
	source: CLAUDE_TOOL,
	uninstall(scope, cwd) {
		uninstallClaudeCodeHooks(resolveClaudeSettingsPath(scope, cwd));
	},
};
