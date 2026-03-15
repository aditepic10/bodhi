import type { Key } from "ink";

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
	{ description: "Cursor home", id: "home", label: "Ctrl+A" },
	{ description: "Cursor end", id: "end", label: "Ctrl+E" },
	{ description: "Kill to end", id: "kill", label: "Ctrl+K" },
	{ description: "Delete word back", id: "delword", label: "Ctrl+W" },
	{ description: "Scroll up", id: "scrollup", label: "↑" },
	{ description: "Scroll down", id: "scrolldown", label: "↓" },
];

export function isEnterKey(key: Key): boolean {
	return key.return;
}

export function isSendKey(key: Key): boolean {
	return key.return && !key.shift;
}

export function isNewlineKey(key: Key): boolean {
	return key.return && key.shift;
}

export function isInterruptKey(input: string, key: Key): boolean {
	return key.ctrl && input.toLowerCase() === "c";
}

export function isOpenSessionsKey(input: string, key: Key): boolean {
	return key.ctrl && input.toLowerCase() === "s";
}

export function isHelpKey(input: string, _key: Key, composerEmpty: boolean): boolean {
	return composerEmpty && input === "?";
}

export function isCommandPaletteKey(input: string, key: Key, composerEmpty: boolean): boolean {
	return composerEmpty && !key.ctrl && !key.meta && input === "/";
}
