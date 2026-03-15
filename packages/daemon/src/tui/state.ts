import type { ChatSession, ChatSessionListEntry } from "@bodhi/types";
import type { UIMessageChunk } from "ai";
import {
	appendTextDelta,
	appendToolEntry,
	conversationToTranscript,
	type TranscriptEntry,
} from "./transcript-builders";

export type {
	TextTranscriptEntry,
	ToolTranscriptEntry,
	TranscriptEntry,
} from "./transcript-builders";
export { conversationToTranscript } from "./transcript-builders";

export type TuiOverlay = "commands" | "help" | "none" | "sessions";
export type TuiStatus = "error" | "idle" | "initializing" | "ready" | "streaming";

export interface TuiState {
	error: string | null;
	isStreaming: boolean;
	overlay: TuiOverlay;
	selectedOverlayIndex: number;
	session: ChatSession | null;
	sessions: ChatSessionListEntry[];
	status: TuiStatus;
	transcript: TranscriptEntry[];
}

export type TuiAction =
	| { type: "append-user-message"; message: string }
	| { type: "close-overlay" }
	| {
			type: "hydrate-session";
			messages: Parameters<typeof conversationToTranscript>[0];
			session: ChatSession;
	  }
	| { type: "move-overlay-selection"; delta: -1 | 1 }
	| { type: "open-overlay"; overlay: Exclude<TuiOverlay, "none"> }
	| { type: "set-error"; error: string | null }
	| { type: "set-sessions"; sessions: ChatSessionListEntry[] }
	| { type: "set-status"; status: TuiStatus }
	| { type: "start-stream" }
	| { type: "stream-chunk"; chunk: UIMessageChunk };

const initialState: TuiState = {
	error: null,
	isStreaming: false,
	overlay: "none",
	selectedOverlayIndex: 0,
	session: null,
	sessions: [],
	status: "initializing",
	transcript: [],
};

export function createInitialTuiState(): TuiState {
	return { ...initialState };
}

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
	switch (action.type) {
		case "append-user-message":
			return {
				...state,
				error: null,
				transcript: state.transcript.concat({
					id: `user-${state.transcript.length}`,
					role: "user",
					status: "complete",
					text: action.message,
				}),
			};
		case "close-overlay":
			return { ...state, overlay: "none", selectedOverlayIndex: 0 };
		case "hydrate-session":
			return {
				...state,
				error: null,
				isStreaming: false,
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
		case "set-error":
			return { ...state, error: action.error, status: action.error ? "error" : state.status };
		case "set-sessions":
			return { ...state, sessions: action.sessions };
		case "set-status":
			return { ...state, status: action.status };
		case "start-stream":
			return { ...state, error: null, isStreaming: true, status: "streaming" };
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
	}
}
