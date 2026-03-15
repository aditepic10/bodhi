import type { ConversationMessage } from "@bodhi/types";
import type { UIMessageChunk } from "ai";

interface TranscriptEntryBase {
	id: string;
	role: "assistant" | "system" | "tool" | "user";
	status: "complete" | "error" | "interrupted" | "streaming";
}

export interface TextTranscriptEntry extends TranscriptEntryBase {
	role: "assistant" | "system" | "user";
	text: string;
}

export interface ToolTranscriptEntry extends TranscriptEntryBase {
	input?: unknown;
	output?: unknown;
	role: "tool";
	summary: string;
	toolCallId?: string;
	toolName?: string;
}

export type TranscriptEntry = TextTranscriptEntry | ToolTranscriptEntry;

export function parseJson(value?: string): unknown {
	if (!value) {
		return undefined;
	}
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

export function summarizeToolMessage(message: ConversationMessage): ToolTranscriptEntry {
	const content = parseJson(message.content_json);
	let toolName: string | undefined;
	let output: unknown;
	let input: unknown;

	if (Array.isArray(content)) {
		const toolResult = content.find(
			(part) => part && typeof part === "object" && part.type === "tool-result",
		);
		if (toolResult && typeof toolResult === "object") {
			toolName = typeof toolResult.toolName === "string" ? toolResult.toolName : undefined;
			output = "output" in toolResult ? toolResult.output : undefined;
		}
		const toolInput = content.find(
			(part) => part && typeof part === "object" && part.type === "tool-call",
		);
		if (toolInput && typeof toolInput === "object") {
			toolName =
				toolName ?? (typeof toolInput.toolName === "string" ? toolInput.toolName : undefined);
			input = "input" in toolInput ? toolInput.input : undefined;
		}
	}

	return {
		id: `history-tool-${Math.random().toString(36).slice(2, 10)}`,
		input,
		output,
		role: "tool",
		status: message.status,
		summary: message.content,
		toolName,
	};
}

export function conversationToTranscript(messages: ConversationMessage[]): TranscriptEntry[] {
	return messages.map((message, index) => {
		if (message.role === "tool") {
			return {
				...summarizeToolMessage(message),
				id: `history-tool-${index}`,
			};
		}

		return {
			id: `history-${message.role}-${index}`,
			role: message.role,
			status: message.status,
			text: message.content,
		} as TextTranscriptEntry;
	});
}

export function appendTextDelta(
	entries: TranscriptEntry[],
	chunk: UIMessageChunk & { type: "text-delta" },
): TranscriptEntry[] {
	const baseId = `assistant-${chunk.id}`;

	// Find the last assistant entry for this chunk ID (could be a continuation)
	let lastMatchIndex = -1;
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry && entry.role === "assistant" && entry.id.startsWith(baseId)) {
			lastMatchIndex = i;
			break;
		}
	}

	if (lastMatchIndex >= 0) {
		const existing = entries[lastMatchIndex] as TextTranscriptEntry;
		// If there are tool entries after this assistant entry, create a continuation
		// at the end instead of updating in-place (prevents text appearing above tools)
		const hasToolsAfter = entries.slice(lastMatchIndex + 1).some((e) => e.role === "tool");
		if (hasToolsAfter) {
			const continuationId = `${baseId}-cont-${entries.length}`;
			return entries.concat({
				id: continuationId,
				role: "assistant",
				status: "streaming",
				text: chunk.delta,
			});
		}

		const updated: TextTranscriptEntry = {
			...existing,
			status: "streaming",
			text: `${existing.text}${chunk.delta}`,
		};
		return entries.map((entry, index) => (index === lastMatchIndex ? updated : entry));
	}

	return entries.concat({
		id: baseId,
		role: "assistant",
		status: "streaming",
		text: chunk.delta,
	});
}

export function appendToolEntry(
	entries: TranscriptEntry[],
	chunk: UIMessageChunk,
): TranscriptEntry[] {
	const toolCallId =
		"type" in chunk && "toolCallId" in chunk && typeof chunk.toolCallId === "string"
			? chunk.toolCallId
			: `tool-${Math.random().toString(36).slice(2, 10)}`;
	const id = `tool-${toolCallId}`;
	const existingIndex = entries.findIndex((entry) => entry.id === id);
	const existing =
		existingIndex >= 0 && entries[existingIndex]?.role === "tool"
			? (entries[existingIndex] as ToolTranscriptEntry)
			: null;

	const next: ToolTranscriptEntry = {
		id,
		input:
			chunk.type === "tool-input-available" || chunk.type === "tool-input-error"
				? chunk.input
				: existing?.input,
		output: chunk.type === "tool-output-available" ? chunk.output : existing?.output,
		role: "tool",
		status:
			chunk.type === "tool-output-error" || chunk.type === "tool-input-error"
				? "error"
				: chunk.type === "tool-output-available"
					? "complete"
					: "streaming",
		summary:
			chunk.type === "tool-output-error"
				? chunk.errorText
				: chunk.type === "tool-input-error"
					? chunk.errorText
					: (existing?.summary ??
						`Running ${"toolName" in chunk && typeof chunk.toolName === "string" ? chunk.toolName : "tool"}`),
		toolCallId,
		toolName:
			"toolName" in chunk && typeof chunk.toolName === "string"
				? chunk.toolName
				: existing?.toolName,
	};

	if (existingIndex >= 0) {
		return entries.map((entry, index) => (index === existingIndex ? next : entry));
	}

	return entries.concat(next);
}
