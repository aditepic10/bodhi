import { Box, Text } from "ink";
import { renderTranscriptEntry } from "../renderers/registry";
import type { TranscriptEntry } from "../state";
import type { TuiTheme } from "../theme";
import { EmptyState, Notice, ThinkingState } from "./primitives";

export function Transcript(props: {
	clippedAbove: number;
	clippedBelow: number;
	error: string | null;
	entries: TranscriptEntry[];
	streaming: boolean;
	theme: TuiTheme;
}) {
	if (props.entries.length === 0) {
		return (
			<EmptyState
				message="A new session is open. Ask about your work, context, or what Bodhi should remember."
				theme={props.theme}
			/>
		);
	}

	return (
		<Box flexDirection="column">
			{props.clippedAbove > 0 ? (
				<Text color={props.theme.dim}>↑ {props.clippedAbove} above</Text>
			) : null}
			{props.entries.map((entry, index) => {
				const nextEntry = props.entries[index + 1];
				const isToolRow = entry.role === "tool";
				const nextIsTool = nextEntry?.role === "tool";
				const marginAfter =
					index === props.entries.length - 1 ? 0 : isToolRow || nextIsTool ? 0 : 1;
				return (
					<Box key={entry.id} flexDirection="column" marginBottom={marginAfter}>
						{renderTranscriptEntry(entry, props.theme)}
					</Box>
				);
			})}
			{props.clippedBelow > 0 ? (
				<Text color={props.theme.dim}>↓ {props.clippedBelow} below</Text>
			) : null}
			<ThinkingState active={props.streaming} theme={props.theme} />
			{props.error ? (
				<Box marginTop={1}>
					<Notice kind="error" message={props.error} theme={props.theme} />
				</Box>
			) : null}
		</Box>
	);
}
