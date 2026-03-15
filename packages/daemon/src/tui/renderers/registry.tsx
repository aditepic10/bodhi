import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { ToolTranscriptEntry, TranscriptEntry } from "../state";
import type { TuiTheme } from "../theme";

function renderMemorySearch(entry: ToolTranscriptEntry, theme: TuiTheme): ReactNode {
	const output = entry.output;
	const events =
		output && typeof output === "object" && Array.isArray((output as { events?: unknown[] }).events)
			? ((output as { events: Array<{ type?: string }> }).events ?? [])
			: [];
	const facts =
		output && typeof output === "object" && Array.isArray((output as { facts?: unknown[] }).facts)
			? ((output as { facts: Array<{ key?: string; value?: string }> }).facts ?? [])
			: [];

	const status = entry.status === "complete" ? "" : " …";

	return (
		<Text color={theme.toolDim}>
			↳ searched memory · {events.length} events · {facts.length} facts{status}
		</Text>
	);
}

function renderStoreFact(entry: ToolTranscriptEntry, theme: TuiTheme): ReactNode {
	const output =
		entry.output && typeof entry.output === "object"
			? (entry.output as Record<string, unknown>)
			: {};
	const key = typeof output.key === "string" ? output.key : "fact";
	const value = typeof output.value === "string" ? output.value : "";

	return (
		<Text color={theme.toolDim}>
			↳ stored {key} = {value}
		</Text>
	);
}

function renderGenericTool(entry: ToolTranscriptEntry, theme: TuiTheme): ReactNode {
	const name = entry.toolName ?? "tool";
	const suffix = entry.status !== "complete" ? " …" : "";
	const label = `↳ ${name} · ${entry.summary}${suffix}`;

	return <Text color={theme.toolDim}>{label}</Text>;
}

export function renderTranscriptEntry(entry: TranscriptEntry, theme: TuiTheme): ReactNode {
	if (entry.role === "user") {
		return (
			<Box flexDirection="column">
				<Text bold color={theme.accent}>
					You
				</Text>
				<Text color={theme.text}>{entry.text}</Text>
			</Box>
		);
	}

	if (entry.role === "assistant") {
		const isContinuation = entry.id.includes("-cont-");
		return (
			<Box flexDirection="column">
				{isContinuation ? null : (
					<Text bold color={theme.muted}>
						Bodhi
					</Text>
				)}
				<Text color={theme.text}>{entry.text}</Text>
			</Box>
		);
	}

	if (entry.role === "system") {
		return <Text color={theme.dim}>{entry.text}</Text>;
	}

	if (entry.role !== "tool") {
		return null;
	}

	switch (entry.toolName) {
		case "memory-search":
			return renderMemorySearch(entry, theme);
		case "store-fact":
			return renderStoreFact(entry, theme);
		default:
			return renderGenericTool(entry, theme);
	}
}
