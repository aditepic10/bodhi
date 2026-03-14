import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BodhiConfig, BodhiEvent } from "@bodhi/types";

function spoolPath(config: BodhiConfig): string {
	return join(config.data_dir, `spool.${process.pid}.jsonl`);
}

export function stableEventId(seed?: string): string {
	if (!seed) {
		return randomUUID();
	}

	return `assistant-${Bun.hash(seed).toString(16)}`;
}

export function appendAssistantEventsToSpool(
	config: BodhiConfig,
	events: readonly BodhiEvent[],
): void {
	if (events.length === 0) {
		return;
	}

	const path = spoolPath(config);
	mkdirSync(dirname(path), { recursive: true });
	for (const event of events) {
		writeFileSync(path, `${JSON.stringify(event)}\n`, {
			encoding: "utf8",
			flag: "a",
			mode: 0o600,
		});
	}
	chmodSync(path, 0o600);
}

export function globalClaudeSettingsPath(): string {
	return join(process.env.HOME ?? homedir(), ".claude", "settings.json");
}

export function globalOpenCodePluginPath(): string {
	return join(process.env.HOME ?? homedir(), ".config", "opencode", "plugins", "bodhi.ts");
}
