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

	const suffix = entry.status === "complete" ? "" : " …";

	return (
		<box flexDirection="row" paddingLeft={2}>
			<text fg={theme.toolIcon}>◆ </text>
			<text fg={theme.toolDim}>
				searched memory · {events.length} events, {facts.length} facts{suffix}
			</text>
		</box>
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
		<box flexDirection="row" paddingLeft={2}>
			<text fg={theme.toolIcon}>◆ </text>
			<text fg={theme.toolDim}>
				stored {key} = {value}
			</text>
		</box>
	);
}

function renderGenericTool(entry: ToolTranscriptEntry, theme: TuiTheme): ReactNode {
	const name = entry.toolName ?? "tool";
	const suffix = entry.status !== "complete" ? " …" : "";

	return (
		<box flexDirection="row" paddingLeft={2}>
			<text fg={theme.toolIcon}>◆ </text>
			<text fg={theme.toolDim}>
				{name} · {entry.summary}
				{suffix}
			</text>
		</box>
	);
}

export function renderTranscriptEntry(entry: TranscriptEntry, theme: TuiTheme): ReactNode {
	if (entry.role === "user") {
		return (
			<box flexDirection="column">
				<text fg={theme.userLabel}>
					<b>You</b>
				</text>
				<box paddingLeft={2}>
					<text fg={theme.text}>{entry.text}</text>
				</box>
			</box>
		);
	}

	if (entry.role === "assistant") {
		const isContinuation = entry.id.includes("-cont-");
		return (
			<box flexDirection="column">
				{isContinuation ? null : (
					<text fg={theme.assistantLabel}>
						<b>Bodhi</b>
					</text>
				)}
				<box flexDirection="row">
					<text fg={theme.assistantBar}>▎ </text>
					<text fg={theme.text}>{entry.text}</text>
				</box>
			</box>
		);
	}

	if (entry.role === "system") {
		return <text fg={theme.dim}>{entry.text}</text>;
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
