import type { AssistantCaptureSource } from "./types";

export function assistantCaptureCommand(source: AssistantCaptureSource): string {
	return `bodhi internal ai-capture ${source}`;
}

export function assistantCaptureArgv(source: AssistantCaptureSource): readonly string[] {
	return ["bodhi", "internal", "ai-capture", source];
}
