import type { KeyEvent } from "@opentui/core";

// ── Keybinding catalogue ──────────────────────────────────────
export interface TuiKeybinding {
	description: string;
	id: string;
	label: string;
}

export const tuiKeybindings: TuiKeybinding[] = [
	{ description: "Send message", id: "send", label: "Enter" },
	{ description: "Insert newline", id: "newline", label: "Shift+Enter" },
	{ description: "Interrupt / exit", id: "interrupt", label: "Ctrl+C" },
	{ description: "Session switcher", id: "sessions", label: "Ctrl+S" },
	{ description: "Help", id: "help", label: "?" },
	{ description: "Command palette", id: "commands", label: "/" },
	{ description: "Close overlay", id: "close", label: "Esc" },
	{ description: "Toggle focus", id: "focus", label: "Tab" },
	{ description: "Scroll up", id: "scrollup", label: "↑ (transcript focused)" },
	{ description: "Scroll down", id: "scrolldown", label: "↓ (transcript focused)" },
];

// ── Key matchers ──────────────────────────────────────────────

export function isInterruptKey(key: KeyEvent): boolean {
	return key.ctrl && key.name === "c";
}

export function isOpenSessionsKey(key: KeyEvent): boolean {
	return key.ctrl && key.name === "s";
}

export function isHelpKey(key: KeyEvent, composerEmpty: boolean): boolean {
	return composerEmpty && !key.ctrl && !key.meta && key.name === "?";
}

export function isCommandPaletteKey(key: KeyEvent, composerEmpty: boolean): boolean {
	return composerEmpty && !key.ctrl && !key.meta && key.name === "/";
}
