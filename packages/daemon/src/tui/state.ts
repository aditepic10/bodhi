import type { ChatSession, ChatSessionListEntry, ConversationMessage } from "@bodhi/types";
import type { UIMessageChunk } from "ai";

export type TuiOverlay = "commands" | "help" | "none" | "sessions";
export type TuiStatus = "error" | "idle" | "initializing" | "ready" | "streaming";

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

export interface ComposerState {
	cursor: number;
	text: string;
}

export interface TuiState {
	composer: ComposerState;
	error: string | null;
	isStreaming: boolean;
	overlay: TuiOverlay;
	scrollOffset: number;
	selectedOverlayIndex: number;
	session: ChatSession | null;
	sessions: ChatSessionListEntry[];
	status: TuiStatus;
	transcript: TranscriptEntry[];
}

export type TuiAction =
	| { type: "append-composer"; value: string }
	| { type: "append-user-message"; message: string }
	| { type: "clear-composer" }
	| { type: "close-overlay" }
	| { type: "composer-cursor-end" }
	| { type: "composer-cursor-home" }
	| { type: "composer-cursor-left" }
	| { type: "composer-cursor-right" }
	| { type: "composer-delete-word-back" }
	| { type: "composer-kill-to-end" }
	| { type: "hydrate-session"; messages: ConversationMessage[]; session: ChatSession }
	| { type: "move-overlay-selection"; delta: -1 | 1 }
	| { type: "open-overlay"; overlay: Exclude<TuiOverlay, "none"> }
	| { type: "scroll-transcript"; delta: number }
	| { type: "scroll-to-bottom" }
	| { type: "set-composer"; value: string }
	| { type: "set-error"; error: string | null }
	| { type: "set-sessions"; sessions: ChatSessionListEntry[] }
	| { type: "set-status"; status: TuiStatus }
	| { type: "start-stream" }
	| { type: "stream-chunk"; chunk: UIMessageChunk }
	| { type: "trim-composer" };

const initialState: TuiState = {
	composer: { cursor: 0, text: "" },
	error: null,
	isStreaming: false,
	overlay: "none",
	scrollOffset: 0,
	selectedOverlayIndex: 0,
	session: null,
	sessions: [],
	status: "initializing",
	transcript: [],
};

function parseJson(value?: string): unknown {
	if (!value) {
		return undefined;
	}
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function summarizeToolMessage(message: ConversationMessage): ToolTranscriptEntry {
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

function appendTextDelta(
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

function appendToolEntry(entries: TranscriptEntry[], chunk: UIMessageChunk): TranscriptEntry[] {
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

// Composer helpers
function insertAtCursor(composer: ComposerState, value: string): ComposerState {
	const chars = Array.from(composer.text);
	const insertChars = Array.from(value);
	const cursor = Math.min(composer.cursor, chars.length);
	chars.splice(cursor, 0, ...insertChars);
	return { cursor: cursor + insertChars.length, text: chars.join("") };
}

function deleteCharBeforeCursor(composer: ComposerState): ComposerState {
	if (composer.cursor <= 0) {
		return composer;
	}
	const chars = Array.from(composer.text);
	const cursor = Math.min(composer.cursor, chars.length);
	chars.splice(cursor - 1, 1);
	return { cursor: cursor - 1, text: chars.join("") };
}

function deleteWordBack(composer: ComposerState): ComposerState {
	if (composer.cursor <= 0) {
		return composer;
	}
	const chars = Array.from(composer.text);
	const cursor = Math.min(composer.cursor, chars.length);
	let target = cursor;
	// Skip whitespace
	while (target > 0 && chars[target - 1] === " ") {
		target--;
	}
	// Skip word characters
	while (target > 0 && chars[target - 1] !== " ") {
		target--;
	}
	chars.splice(target, cursor - target);
	return { cursor: target, text: chars.join("") };
}

function killToEnd(composer: ComposerState): ComposerState {
	const chars = Array.from(composer.text);
	const cursor = Math.min(composer.cursor, chars.length);
	chars.splice(cursor);
	return { cursor, text: chars.join("") };
}

export function createInitialTuiState(): TuiState {
	return { ...initialState };
}

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
	switch (action.type) {
		case "append-composer":
			return { ...state, composer: insertAtCursor(state.composer, action.value) };
		case "append-user-message":
			return {
				...state,
				error: null,
				scrollOffset: 0,
				transcript: state.transcript.concat({
					id: `user-${state.transcript.length}`,
					role: "user",
					status: "complete",
					text: action.message,
				}),
			};
		case "clear-composer":
			return { ...state, composer: { cursor: 0, text: "" } };
		case "close-overlay":
			return { ...state, overlay: "none", selectedOverlayIndex: 0 };
		case "composer-cursor-end":
			return {
				...state,
				composer: { ...state.composer, cursor: Array.from(state.composer.text).length },
			};
		case "composer-cursor-home":
			return { ...state, composer: { ...state.composer, cursor: 0 } };
		case "composer-cursor-left":
			return {
				...state,
				composer: { ...state.composer, cursor: Math.max(0, state.composer.cursor - 1) },
			};
		case "composer-cursor-right":
			return {
				...state,
				composer: {
					...state.composer,
					cursor: Math.min(Array.from(state.composer.text).length, state.composer.cursor + 1),
				},
			};
		case "composer-delete-word-back":
			return { ...state, composer: deleteWordBack(state.composer) };
		case "composer-kill-to-end":
			return { ...state, composer: killToEnd(state.composer) };
		case "hydrate-session":
			return {
				...state,
				error: null,
				isStreaming: false,
				scrollOffset: 0,
				session: action.session,
				status: "ready",
				transcript: conversationToTranscript(action.messages),
			};
		case "move-overlay-selection": {
			const items = state.overlay === "sessions" ? state.sessions.length : 3;
			if (items <= 0) {
				return state;
			}
			const clampedIndex = Math.min(state.selectedOverlayIndex, items - 1);
			const nextIndex = (clampedIndex + action.delta + items) % items;
			return { ...state, selectedOverlayIndex: nextIndex };
		}
		case "open-overlay":
			return { ...state, overlay: action.overlay, selectedOverlayIndex: 0 };
		case "scroll-to-bottom":
			return { ...state, scrollOffset: 0 };
		case "scroll-transcript": {
			const maxOffset = Math.max(0, state.transcript.length - 1);
			const next = Math.max(0, Math.min(maxOffset, state.scrollOffset + action.delta));
			return { ...state, scrollOffset: next };
		}
		case "set-composer": {
			const chars = Array.from(action.value);
			return { ...state, composer: { cursor: chars.length, text: action.value } };
		}
		case "set-error":
			return { ...state, error: action.error, status: action.error ? "error" : state.status };
		case "set-sessions":
			return { ...state, sessions: action.sessions };
		case "set-status":
			return { ...state, status: action.status };
		case "start-stream":
			return { ...state, error: null, isStreaming: true, scrollOffset: 0, status: "streaming" };
		case "stream-chunk":
			switch (action.chunk.type) {
				case "abort":
					return { ...state, isStreaming: false, status: "ready" };
				case "error":
					return { ...state, error: action.chunk.errorText, isStreaming: false, status: "error" };
				case "finish":
					return {
						...state,
						isStreaming: false,
						status: action.chunk.finishReason === "error" ? "error" : "ready",
						transcript: state.transcript.map((entry) =>
							entry.role === "assistant" && entry.status === "streaming"
								? { ...entry, status: "complete" }
								: entry,
						),
					};
				case "text-delta":
					return { ...state, transcript: appendTextDelta(state.transcript, action.chunk) };
				case "tool-input-start":
				case "tool-input-available":
				case "tool-input-error":
				case "tool-output-available":
				case "tool-output-error":
					return { ...state, transcript: appendToolEntry(state.transcript, action.chunk) };
				default:
					return state;
			}
		case "trim-composer":
			return { ...state, composer: deleteCharBeforeCursor(state.composer) };
	}
}
