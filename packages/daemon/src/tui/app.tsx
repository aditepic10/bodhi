import { Box, useApp, useInput } from "ink";
import { useEffect, useMemo, useReducer, useRef } from "react";
import type { CliRuntime } from "../cli/types";
import {
	createChatSession,
	listChatSessions,
	loadChatSession,
	loadConversation,
	streamChatTurn,
} from "./client";
import { CommandPalette, commandPaletteActions } from "./components/command-palette";
import { Composer } from "./components/composer";
import { Header } from "./components/header";
import { HelpOverlay } from "./components/help-overlay";
import { Divider, LoadingState } from "./components/primitives";
import { SessionSwitcher } from "./components/session-switcher";
import { StatusBar } from "./components/status-bar";
import { Transcript } from "./components/transcript";
import type { TuiConfig } from "./config";
import { useTerminalSize } from "./hooks/use-terminal-size";
import {
	isCommandPaletteKey,
	isHelpKey,
	isInterruptKey,
	isNewlineKey,
	isOpenSessionsKey,
	isSendKey,
} from "./keybindings";
import type { TuiOverlay } from "./state";
import { createInitialTuiState, tuiReducer } from "./state";
import type { TuiTheme } from "./theme";

export interface BodhiTuiAppProps {
	config: TuiConfig;
	onSessionChange(sessionId: string): void;
	resumeSessionId?: string;
	runtime: CliRuntime;
	theme: TuiTheme;
}

async function bootstrapSession(runtime: CliRuntime, sessionId?: string) {
	const session = sessionId
		? await loadChatSession(runtime, sessionId)
		: await createChatSession(runtime);
	const messages = await loadConversation(runtime, session.session_id);
	const sessions = await listChatSessions(runtime);
	return { messages, session, sessions };
}

async function syncSessionState(
	runtime: CliRuntime,
	sessionId: string,
): Promise<{
	messages: Awaited<ReturnType<typeof loadConversation>>;
	session: Awaited<ReturnType<typeof loadChatSession>>;
	sessions: Awaited<ReturnType<typeof listChatSessions>>;
}> {
	const [session, messages, sessions] = await Promise.all([
		loadChatSession(runtime, sessionId),
		loadConversation(runtime, sessionId),
		listChatSessions(runtime),
	]);

	return { messages, session, sessions };
}

function renderOverlay(
	overlay: TuiOverlay,
	state: ReturnType<typeof createInitialTuiState>,
	theme: TuiTheme,
) {
	if (overlay === "sessions") {
		return (
			<SessionSwitcher
				selectedIndex={state.selectedOverlayIndex}
				sessions={state.sessions}
				theme={theme}
			/>
		);
	}

	if (overlay === "help") {
		return <HelpOverlay theme={theme} />;
	}

	if (overlay === "commands") {
		return <CommandPalette selectedIndex={state.selectedOverlayIndex} theme={theme} />;
	}

	return null;
}

export function BodhiTuiApp(props: BodhiTuiAppProps) {
	const { exit } = useApp();
	const [state, dispatch] = useReducer(tuiReducer, undefined, createInitialTuiState);
	const abortRef = useRef<AbortController | null>(null);
	const terminal = useTerminalSize();

	useEffect(() => {
		let cancelled = false;
		void bootstrapSession(props.runtime, props.resumeSessionId)
			.then(({ messages, session, sessions }) => {
				if (cancelled) {
					return;
				}
				dispatch({ messages, session, type: "hydrate-session" });
				dispatch({ sessions, type: "set-sessions" });
				props.onSessionChange(session.session_id);
			})
			.catch((error) => {
				if (cancelled) {
					return;
				}
				dispatch({
					error: error instanceof Error ? error.message : String(error),
					type: "set-error",
				});
			});
		return () => {
			cancelled = true;
		};
	}, [props.resumeSessionId, props.runtime, props.onSessionChange]);

	const { clippedAbove, clippedBelow, visibleEntries } = useMemo(() => {
		const maxEntries = Math.max(8, terminal.rows - 6);
		const total = state.transcript.length;
		const offset = state.scrollOffset;

		if (offset <= 0 || total <= maxEntries) {
			// At bottom (default) — show last maxEntries
			const entries = state.transcript.slice(-maxEntries);
			return {
				clippedAbove: total - entries.length,
				clippedBelow: 0,
				visibleEntries: entries,
			};
		}

		// Scrolled up — show window offset from the end
		const endIndex = Math.max(maxEntries, total - offset);
		const startIndex = Math.max(0, endIndex - maxEntries);
		return {
			clippedAbove: startIndex,
			clippedBelow: total - endIndex,
			visibleEntries: state.transcript.slice(startIndex, endIndex),
		};
	}, [state.transcript, state.scrollOffset, terminal.rows]);

	const refreshSessions = async () => {
		try {
			dispatch({ sessions: await listChatSessions(props.runtime), type: "set-sessions" });
		} catch (error) {
			dispatch({
				error: error instanceof Error ? error.message : String(error),
				type: "set-error",
			});
		}
	};

	const refreshCurrentSession = async (sessionId: string) => {
		try {
			const { messages, session, sessions } = await syncSessionState(props.runtime, sessionId);
			dispatch({ messages, session, type: "hydrate-session" });
			dispatch({ sessions, type: "set-sessions" });
			props.onSessionChange(session.session_id);
		} catch (error) {
			dispatch({
				error: error instanceof Error ? error.message : String(error),
				type: "set-error",
			});
		}
	};

	const switchToSession = async (sessionId: string) => {
		try {
			const { messages, session, sessions } = await syncSessionState(props.runtime, sessionId);
			dispatch({ messages, session, type: "hydrate-session" });
			dispatch({ sessions, type: "set-sessions" });
			dispatch({ type: "close-overlay" });
			props.onSessionChange(session.session_id);
		} catch (error) {
			dispatch({
				error: error instanceof Error ? error.message : String(error),
				type: "set-error",
			});
		}
	};

	const sendMessage = async () => {
		if (state.isStreaming || !state.session) {
			return;
		}

		const message = state.composer.text.trim();
		if (!message) {
			return;
		}

		dispatch({ message, type: "append-user-message" });
		dispatch({ type: "clear-composer" });
		dispatch({ type: "start-stream" });

		const abortController = new AbortController();
		abortRef.current = abortController;
		try {
			await streamChatTurn(
				props.runtime,
				{ message, sessionId: state.session.session_id },
				(chunk) => {
					dispatch({ chunk, type: "stream-chunk" });
				},
				{ signal: abortController.signal },
			);
			await refreshCurrentSession(state.session.session_id);
		} catch (error) {
			if (abortController.signal.aborted) {
				dispatch({ status: "ready", type: "set-status" });
			} else {
				dispatch({
					error: error instanceof Error ? error.message : String(error),
					type: "set-error",
				});
			}
		} finally {
			abortRef.current = null;
		}
	};

	useInput((input, key) => {
		if (isInterruptKey(input, key)) {
			if (state.isStreaming) {
				abortRef.current?.abort();
				return;
			}
			exit({ sessionId: state.session?.session_id });
			return;
		}

		if (state.overlay !== "none") {
			if (key.escape) {
				dispatch({ type: "close-overlay" });
				return;
			}
			if (key.upArrow) {
				dispatch({ delta: -1, type: "move-overlay-selection" });
				return;
			}
			if (key.downArrow) {
				dispatch({ delta: 1, type: "move-overlay-selection" });
				return;
			}
			if (key.return) {
				if (state.overlay === "sessions") {
					const selected = state.sessions[state.selectedOverlayIndex];
					if (selected && !state.isStreaming) {
						void switchToSession(selected.session_id);
					}
					return;
				}
				if (state.overlay === "commands") {
					const action = commandPaletteActions[state.selectedOverlayIndex];
					if (!action) {
						return;
					}
					if (action.id === "sessions") {
						void refreshSessions().then(() => {
							dispatch({ overlay: "sessions", type: "open-overlay" });
						});
						return;
					}
					if (action.id === "help") {
						dispatch({ overlay: "help", type: "open-overlay" });
						return;
					}
					exit({ sessionId: state.session?.session_id });
				}
			}
			return;
		}

		if (isOpenSessionsKey(input, key)) {
			void refreshSessions().then(() => {
				dispatch({ overlay: "sessions", type: "open-overlay" });
			});
			return;
		}
		if (isHelpKey(input, key, state.composer.text.trim().length === 0)) {
			dispatch({ overlay: "help", type: "open-overlay" });
			return;
		}
		if (key.escape) {
			// Dismiss error on Esc if one is showing
			if (state.error) {
				dispatch({ error: null, type: "set-error" });
			}
			dispatch({ type: "close-overlay" });
			return;
		}
		if (isCommandPaletteKey(input, key, state.composer.text.trim().length === 0)) {
			dispatch({ overlay: "commands", type: "open-overlay" });
			return;
		}
		if (isSendKey(key)) {
			void sendMessage();
			return;
		}
		if (isNewlineKey(key)) {
			dispatch({ value: "\n", type: "append-composer" });
			return;
		}
		// Cursor movement
		if (key.leftArrow && !key.ctrl && !key.meta) {
			dispatch({ type: "composer-cursor-left" });
			return;
		}
		if (key.rightArrow && !key.ctrl && !key.meta) {
			dispatch({ type: "composer-cursor-right" });
			return;
		}
		// Ctrl+A — home
		if (key.ctrl && input.toLowerCase() === "a") {
			dispatch({ type: "composer-cursor-home" });
			return;
		}
		// Ctrl+E — end
		if (key.ctrl && input.toLowerCase() === "e") {
			dispatch({ type: "composer-cursor-end" });
			return;
		}
		// Ctrl+K — kill to end of line
		if (key.ctrl && input.toLowerCase() === "k") {
			dispatch({ type: "composer-kill-to-end" });
			return;
		}
		// Ctrl+W — delete word back
		if (key.ctrl && input.toLowerCase() === "w") {
			dispatch({ type: "composer-delete-word-back" });
			return;
		}
		// Up/down arrow for transcript scrolling (only when no overlay)
		if (key.upArrow) {
			dispatch({ delta: 3, type: "scroll-transcript" });
			return;
		}
		if (key.downArrow) {
			dispatch({ delta: -3, type: "scroll-transcript" });
			return;
		}
		if (key.backspace || key.delete) {
			dispatch({ type: "trim-composer" });
			return;
		}
		if (input.length > 0 && !key.ctrl && !key.meta) {
			dispatch({ value: input, type: "append-composer" });
		}
	});

	if (!state.session && state.status === "initializing") {
		return (
			<Box flexDirection="column" paddingX={1}>
				<LoadingState message="Connecting…" theme={props.theme} />
			</Box>
		);
	}

	const overlay: TuiOverlay = state.overlay;
	const overlayContent = renderOverlay(overlay, state, props.theme);
	const statusLabel =
		state.status === "streaming"
			? "thinking"
			: state.status === "error"
				? "error"
				: state.status === "initializing"
					? "preparing"
					: "ready";

	return (
		<Box flexDirection="column" paddingX={1}>
			<Header session={state.session} theme={props.theme} />
			<Box flexDirection="column" flexGrow={1} marginTop={1}>
				<Transcript
					clippedAbove={clippedAbove}
					clippedBelow={clippedBelow}
					entries={visibleEntries}
					error={overlay === "none" ? state.error : null}
					streaming={state.isStreaming}
					theme={props.theme}
				/>
			</Box>
			{overlayContent ? <Box marginTop={1}>{overlayContent}</Box> : null}
			<Divider theme={props.theme} width={terminal.columns - 4} />
			<Composer composer={state.composer} streaming={state.isStreaming} theme={props.theme} />
			{props.config.show_status_bar ? (
				<StatusBar sessionCount={state.sessions.length} status={statusLabel} theme={props.theme} />
			) : null}
		</Box>
	);
}
