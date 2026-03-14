import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BodhiEvent } from "@bodhi/types";

import type { AssistantCaptureAdapter } from "./adapters";
import { assistantCaptureArgv } from "./command";
import { deriveActivityContext, globalOpenCodePluginPath, stableEventId } from "./helpers";
import { OpenCodeCapturePayloadSchema } from "./types";

const OPENCODE_TOOL = "opencode";

export function buildOpenCodePlugin(command = assistantCaptureArgv(OPENCODE_TOOL)): string {
	return `const encoder = new TextEncoder();
const command = ${JSON.stringify(command)};

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function textFromContent(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry.text === "string") return entry.text;
        if (entry && typeof entry.content === "string") return entry.content;
        return "";
      })
      .filter(Boolean)
      .join("\\n");
  }
  if (value && typeof value.text === "string") {
    return value.text;
  }
  return undefined;
}

function extractTarget(input) {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  for (const key of ["file_path", "path", "command", "pattern", "query", "url", "target"]) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

async function send(payload) {
  const child = Bun.spawn(command, {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  });
  const writer = child.stdin.writer;
  await writer.write(encoder.encode(JSON.stringify(payload)));
  await writer.close();
  await child.exited;
}

export default async ({ directory, worktree }) => {
  const defaultCwd = firstString(directory, worktree);
  return {
    event: async ({ event }) => {
      if (event?.type !== "message.updated") {
        return;
      }

      const message = event.message ?? event.data?.message ?? event;
      const role = firstString(message?.role, event.role);
      if (role !== "user") {
        return;
      }

      const prompt = textFromContent(message?.content ?? message?.parts ?? message?.text);
      if (!prompt) {
        return;
      }

      await send({
        cwd: firstString(event.cwd, defaultCwd),
        event_key: firstString(message?.id, event.id),
        kind: "prompt",
        prompt,
        session_id: firstString(event.sessionID, event.sessionId, event.session?.id),
      });
    },
    "tool.execute.after": async (input) => {
      const toolName = firstString(input?.tool, input?.toolName, input?.name);
      if (!toolName) {
        return;
      }

      await send({
        cwd: firstString(input?.cwd, defaultCwd),
        description: firstString(input?.description, input?.args?.description),
        event_key: firstString(input?.callID, input?.callId, input?.id),
        kind: "tool_call",
        session_id: firstString(input?.sessionID, input?.sessionId, input?.session?.id),
        target: extractTarget(input?.args ?? input?.input),
        tool_name: toolName,
      });
    },
  };
};
`;
}

export function installOpenCodePlugin(pluginPath = globalOpenCodePluginPath()): void {
	mkdirSync(dirname(pluginPath), { recursive: true });
	writeFileSync(pluginPath, buildOpenCodePlugin(), {
		encoding: "utf8",
		mode: 0o600,
	});
}

export function uninstallOpenCodePlugin(pluginPath = globalOpenCodePluginPath()): void {
	if (existsSync(pluginPath)) {
		rmSync(pluginPath);
	}
}

export function readOpenCodePlugin(pluginPath = globalOpenCodePluginPath()): string | null {
	return existsSync(pluginPath) ? readFileSync(pluginPath, "utf8") : null;
}

export function mapOpenCodeCapturePayload(input: unknown): BodhiEvent[] {
	const parsed = OpenCodeCapturePayloadSchema.safeParse(input);
	if (!parsed.success) {
		return [];
	}

	const payload = parsed.data;
	const context = deriveActivityContext(payload.cwd, OPENCODE_TOOL, payload.session_id);
	const eventId = stableEventId(payload.event_key);

	if (payload.kind === "prompt") {
		const content = payload.prompt?.trim();
		if (!content) {
			return [];
		}

		return [
			{
				context,
				event_id: eventId,
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
			event_id: eventId,
			metadata: {
				description: payload.description?.trim() || undefined,
				target: payload.target?.trim() || undefined,
				tool_name: toolName,
			},
			type: "ai.tool_call",
		},
	];
}

function projectOpenCodePluginPath(cwd: string): string {
	return join(cwd, ".opencode", "plugins", "bodhi.ts");
}

function resolveOpenCodePluginPath(scope: "global" | "project", cwd: string): string {
	return scope === "project" ? projectOpenCodePluginPath(cwd) : globalOpenCodePluginPath();
}

export const opencodeAdapter: AssistantCaptureAdapter = {
	defaultScope: "global",
	displayName: "OpenCode",
	install(scope, cwd) {
		const pluginPath = resolveOpenCodePluginPath(scope, cwd);
		installOpenCodePlugin(pluginPath);
		return pluginPath;
	},
	mapPayload: mapOpenCodeCapturePayload,
	source: OPENCODE_TOOL,
	uninstall(scope, cwd) {
		uninstallOpenCodePlugin(resolveOpenCodePluginPath(scope, cwd));
	},
};
