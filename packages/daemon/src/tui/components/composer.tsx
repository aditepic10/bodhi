import { Box, Text } from "ink";
import type { ComposerState } from "../state";
import type { TuiTheme } from "../theme";

function renderWithCursor(text: string, cursor: number, theme: TuiTheme) {
	const chars = Array.from(text);
	const pos = Math.min(cursor, chars.length);
	const before = chars.slice(0, pos).join("");
	const cursorChar = chars[pos] ?? " ";
	const after = chars.slice(pos + 1).join("");

	return (
		<Text>
			<Text color={theme.text}>{before}</Text>
			<Text backgroundColor={theme.accent} color={theme.background}>
				{cursorChar}
			</Text>
			<Text color={theme.text}>{after}</Text>
		</Text>
	);
}

export function Composer(props: { composer: ComposerState; streaming: boolean; theme: TuiTheme }) {
	const hasValue = props.composer.text.length > 0;

	if (!hasValue) {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color={props.theme.accent}>{"❯ "}</Text>
					<Text color={props.theme.dim}>Ask Bodhi anything about your work…</Text>
				</Box>
				<Text color={props.theme.dim}>
					{props.streaming
						? "stream active · Ctrl+C to interrupt"
						: "Enter to send · Shift+Enter for newline"}
				</Text>
			</Box>
		);
	}

	const lines = props.composer.text.split("\n");
	let charOffset = 0;

	return (
		<Box flexDirection="column">
			{lines.map((line, lineIndex) => {
				const lineStart = charOffset;
				charOffset += Array.from(line).length + 1; // +1 for newline
				const prompt = lineIndex === 0 ? "❯ " : "  ";
				const cursorInLine =
					props.composer.cursor >= lineStart &&
					props.composer.cursor <= lineStart + Array.from(line).length;

				return (
					<Box key={`line-${lineStart}`}>
						<Text color={props.theme.accent}>{prompt}</Text>
						{cursorInLine ? (
							renderWithCursor(line, props.composer.cursor - lineStart, props.theme)
						) : (
							<Text color={props.theme.text}>{line}</Text>
						)}
					</Box>
				);
			})}
			<Text color={props.theme.dim}>
				{props.streaming
					? "stream active · Ctrl+C to interrupt"
					: "Enter to send · Shift+Enter for newline"}
			</Text>
		</Box>
	);
}
