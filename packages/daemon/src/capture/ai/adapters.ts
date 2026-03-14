import type { BodhiEvent } from "@bodhi/types";

import { claudeCodeAdapter } from "./claude-code";
import { opencodeAdapter } from "./opencode";
import {
	type AssistantCaptureSource,
	AssistantCaptureSourceSchema,
	type AssistantInstallScope,
} from "./types";

export interface AssistantCaptureAdapter {
	readonly defaultScope: Exclude<AssistantInstallScope, "none">;
	readonly displayName: string;
	readonly source: AssistantCaptureSource;
	install(scope: Exclude<AssistantInstallScope, "none">, cwd: string): string;
	mapPayload(input: unknown): BodhiEvent[];
	uninstall(scope: Exclude<AssistantInstallScope, "none">, cwd: string): void;
}

const ADAPTERS = [
	claudeCodeAdapter,
	opencodeAdapter,
] as const satisfies readonly AssistantCaptureAdapter[];

const ADAPTERS_BY_SOURCE: ReadonlyMap<AssistantCaptureSource, AssistantCaptureAdapter> = new Map(
	ADAPTERS.map((adapter) => [adapter.source, adapter]),
);

export function listAssistantCaptureAdapters(): readonly AssistantCaptureAdapter[] {
	return ADAPTERS;
}

export function getAssistantCaptureAdapter(source: unknown): AssistantCaptureAdapter | null {
	const parsed = AssistantCaptureSourceSchema.safeParse(source);
	if (!parsed.success) {
		return null;
	}

	return ADAPTERS_BY_SOURCE.get(parsed.data) ?? null;
}
