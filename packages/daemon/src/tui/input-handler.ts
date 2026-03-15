import type { KeyEvent } from "@opentui/core";
import { commandPaletteActions } from "./components/command-palette";
import { isCommandPaletteKey, isHelpKey, isInterruptKey, isOpenSessionsKey } from "./keybindings";
import type { TuiAction, TuiState } from "./state";

export interface InputCallbacks {
	abort: () => void;
	dispatch: (action: TuiAction) => void;
	exit: (data?: unknown) => void;
	refreshSessions: () => Promise<void>;
	sendMessage: () => Promise<void>;
	switchToSession: (id: string) => Promise<void>;
}

export function handleTuiInput(
	key: KeyEvent,
	state: TuiState,
	composerEmpty: boolean,
	composerFocused: boolean,
	callbacks: InputCallbacks,
): void {
	const { abort, dispatch, exit, refreshSessions, switchToSession } = callbacks;

	if (isInterruptKey(key)) {
		if (state.isStreaming) {
			abort();
			return;
		}
		exit({ sessionId: state.session?.session_id });
		return;
	}

	if (state.overlay !== "none") {
		if (key.name === "escape") {
			dispatch({ type: "close-overlay" });
			return;
		}
		if (key.name === "up") {
			dispatch({ delta: -1, type: "move-overlay-selection" });
			return;
		}
		if (key.name === "down") {
			dispatch({ delta: 1, type: "move-overlay-selection" });
			return;
		}
		if (key.name === "return") {
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

	if (isOpenSessionsKey(key)) {
		void refreshSessions().then(() => {
			dispatch({ overlay: "sessions", type: "open-overlay" });
		});
		return;
	}
	if (!composerFocused && isHelpKey(key, composerEmpty)) {
		dispatch({ overlay: "help", type: "open-overlay" });
		return;
	}
	if (key.name === "escape") {
		if (state.error) {
			dispatch({ error: null, type: "set-error" });
		}
		dispatch({ type: "close-overlay" });
		return;
	}
	if (!composerFocused && isCommandPaletteKey(key, composerEmpty)) {
		dispatch({ overlay: "commands", type: "open-overlay" });
	}
}
