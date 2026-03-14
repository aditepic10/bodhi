import type { BodhiEvent } from "@bodhi/types";

import { getAssistantCaptureAdapter } from "../capture/ai";
import { appendAssistantEventsToSpool } from "../capture/ai/helpers";
import type { CliRuntime } from "./types";

async function ingestAssistantEvent(
	runtime: CliRuntime,
	config: ReturnType<CliRuntime["loadConfig"]>,
	event: BodhiEvent,
): Promise<void> {
	try {
		const response = await runtime.requestJson(config, "/events", {
			body: event,
			method: "POST",
		});
		if (response.status >= 400) {
			throw new Error(`ingest failed (${response.status})`);
		}
	} catch {
		appendAssistantEventsToSpool(config, [event]);
	}
}

export async function handleAiCapture(
	runtime: CliRuntime,
	args: readonly string[],
): Promise<number> {
	const [source] = args;
	const raw = await runtime.readStdin();
	if (!raw.trim()) {
		return 0;
	}

	let input: unknown;
	try {
		input = JSON.parse(raw);
	} catch {
		return 0;
	}

	const adapter = getAssistantCaptureAdapter(source);
	if (!adapter) {
		return 0;
	}

	const events = adapter.mapPayload(input);

	if (events.length === 0) {
		return 0;
	}

	const config = runtime.loadConfig();
	for (const event of events) {
		await ingestAssistantEvent(runtime, config, event);
	}
	return 0;
}
