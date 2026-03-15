export interface ComposerState {
	cursor: number;
	text: string;
}

export function insertAtCursor(composer: ComposerState, value: string): ComposerState {
	const chars = Array.from(composer.text);
	const insertChars = Array.from(value);
	const cursor = Math.min(composer.cursor, chars.length);
	chars.splice(cursor, 0, ...insertChars);
	return { cursor: cursor + insertChars.length, text: chars.join("") };
}

export function deleteCharBeforeCursor(composer: ComposerState): ComposerState {
	if (composer.cursor <= 0) {
		return composer;
	}
	const chars = Array.from(composer.text);
	const cursor = Math.min(composer.cursor, chars.length);
	chars.splice(cursor - 1, 1);
	return { cursor: cursor - 1, text: chars.join("") };
}

export function deleteWordBack(composer: ComposerState): ComposerState {
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

export function killToEnd(composer: ComposerState): ComposerState {
	const chars = Array.from(composer.text);
	const cursor = Math.min(composer.cursor, chars.length);
	chars.splice(cursor);
	return { cursor, text: chars.join("") };
}

function lineLength(lines: string[], index: number): number {
	const line = lines[index];
	return line !== undefined ? Array.from(line).length : 0;
}

export function moveCursorUp(composer: ComposerState): ComposerState {
	const lines = composer.text.split("\n");
	if (lines.length <= 1) {
		return composer;
	}
	let charsSoFar = 0;
	let currentLine = 0;
	for (let i = 0; i < lines.length; i++) {
		const len = lineLength(lines, i);
		if (composer.cursor <= charsSoFar + len) {
			currentLine = i;
			break;
		}
		charsSoFar += len + 1;
	}
	if (currentLine === 0) {
		return composer;
	}
	const columnInCurrentLine = composer.cursor - charsSoFar;
	let prevLineStart = 0;
	for (let i = 0; i < currentLine - 1; i++) {
		prevLineStart += lineLength(lines, i) + 1;
	}
	const prevLineLen = lineLength(lines, currentLine - 1);
	const clampedColumn = Math.min(columnInCurrentLine, prevLineLen);
	return { ...composer, cursor: prevLineStart + clampedColumn };
}

export function moveCursorDown(composer: ComposerState): ComposerState {
	const lines = composer.text.split("\n");
	if (lines.length <= 1) {
		return composer;
	}
	let charsSoFar = 0;
	let currentLine = 0;
	for (let i = 0; i < lines.length; i++) {
		const len = lineLength(lines, i);
		if (composer.cursor <= charsSoFar + len) {
			currentLine = i;
			break;
		}
		charsSoFar += len + 1;
	}
	if (currentLine >= lines.length - 1) {
		return composer;
	}
	const columnInCurrentLine = composer.cursor - charsSoFar;
	const nextLineStart = charsSoFar + lineLength(lines, currentLine) + 1;
	const nextLineLen = lineLength(lines, currentLine + 1);
	const clampedColumn = Math.min(columnInCurrentLine, nextLineLen);
	return { ...composer, cursor: nextLineStart + clampedColumn };
}
