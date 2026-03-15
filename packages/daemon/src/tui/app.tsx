import type { TextareaRenderable } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CliRuntime } from "../cli/types";
import {
	createChatSession,
	listChatSessions,
	loadChatSession,
	loadConversation,
	streamChatTurn,
} from "./client";
import { CommandPalette } from "./components/command-palette";
import { Composer } from "./components/composer";
import { Header } from "./components/header";
import { HelpOverlay } from "./components/help-overlay";
import { LoadingState } from "./components/primitives";
import { SessionSwitcher } from "./components/session-switcher";
import { StatusBar } from "./components/status-bar";
import { Transcript } from "./components/transcript";
import type { TuiConfig } from "./config";
import { handleTuiInput } from "./input-handler";
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
	const renderer = useRenderer();
	const [state, dispatch] = useReducer(tuiReducer, undefined, createInitialTuiState);
	const abortRef = useRef<AbortController | null>(null);
	const textareaRef = useRef<TextareaRenderable>(null);
	const [composerFocused, setComposerFocused] = useState(true);

	const cleanExit = useCallback(
		(data?: unknown) => {
			renderer.destroy();
			if (data && typeof data === "object" && "sessionId" in data) {
				// Session ID will be picked up by run.tsx via onSessionChange
			}
		},
		[renderer],
	);

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

	const sendMessage = async (text: string) => {
		if (state.isStreaming || !state.session) {
			return;
		}

		const message = text.trim();
		if (!message) {
			return;
		}

		dispatch({ message, type: "append-user-message" });
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

	// Global keyboard handler for shortcuts that apply regardless of focus.
	useKeyboard((key) => {
		// Tab toggles focus between transcript and composer
		if (key.name === "tab") {
			setComposerFocused((prev) => !prev);
			return;
		}

		const composerText = textareaRef.current?.getTextRange(0, 999999) ?? "";
		const composerEmpty = composerText.trim().length === 0;

		handleTuiInput(key, state, composerEmpty, composerFocused, {
			abort: () => abortRef.current?.abort(),
			dispatch,
			exit: cleanExit,
			refreshSessions,
			sendMessage: async () => {
				if (textareaRef.current) {
					const text = textareaRef.current.getTextRange(0, 999999).trim();
					textareaRef.current.clear();
					await sendMessage(text);
				}
			},
			switchToSession,
		});
	});

	if (!state.session && state.status === "initializing") {
		return (
			<box flexDirection="column" paddingX={1}>
				<LoadingState message="Connecting…" theme={props.theme} />
			</box>
		);
	}

	const overlay: TuiOverlay = state.overlay;
	const overlayContent = renderOverlay(overlay, state, props.theme);

	return (
		<box flexDirection="column" width="100%" height="100%">
			<box height={1} paddingX={1}>
				<Header session={state.session} theme={props.theme} />
			</box>

			{/* Transcript ScrollBox — handles mouse + keyboard scroll natively */}
			<scrollbox
				scrollY={true}
				stickyScroll={true}
				stickyStart="bottom"
				focused={!composerFocused}
				flexGrow={1}
				width="100%"
				borderStyle="rounded"
				borderColor={!composerFocused ? props.theme.accent : props.theme.border}
				backgroundColor={props.theme.background}
			>
				<Transcript
					entries={state.transcript}
					error={overlay === "none" ? state.error : null}
					motion={props.config.motion}
					streaming={state.isStreaming}
					theme={props.theme}
				/>
			</scrollbox>

			{overlayContent ? <box marginTop={1}>{overlayContent}</box> : null}

			{/* Composer textarea */}
			<Composer
				focused={composerFocused}
				onSubmit={(text) => void sendMessage(text)}
				streaming={state.isStreaming}
				theme={props.theme}
			/>

			{/* Status bar */}
			{props.config.show_status_bar ? (
				<box height={1} paddingX={1}>
					<StatusBar motion={props.config.motion} status={state.status} theme={props.theme} />
				</box>
			) : null}
		</box>
	);
}
