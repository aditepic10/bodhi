import type { TuiMotion } from "../config";
import { renderTranscriptEntry } from "../renderers/registry";
import type { TranscriptEntry } from "../state";
import type { TuiTheme } from "../theme";
import { Notice, ThinkingState } from "./primitives";
import { WelcomeState } from "./welcome";

export function Transcript(props: {
	error: string | null;
	entries: TranscriptEntry[];
	motion?: TuiMotion;
	streaming: boolean;
	theme: TuiTheme;
}) {
	if (props.entries.length === 0) {
		return <WelcomeState theme={props.theme} />;
	}

	const lastEntry = props.entries[props.entries.length - 1];
	const showCompletion =
		!props.streaming &&
		lastEntry &&
		(lastEntry.role === "assistant" || lastEntry.role === "tool") &&
		lastEntry.status === "complete";

	return (
		<box flexDirection="column">
			{props.entries.map((entry, index) => {
				const nextEntry = props.entries[index + 1];
				const isToolRow = entry.role === "tool";
				const nextIsTool = nextEntry?.role === "tool";
				const marginAfter =
					index === props.entries.length - 1 ? 0 : isToolRow || nextIsTool ? 0 : 1;
				return (
					<box key={entry.id} flexDirection="column" marginBottom={marginAfter}>
						{renderTranscriptEntry(entry, props.theme)}
					</box>
				);
			})}
			<ThinkingState
				active={props.streaming && !props.entries.some((e) => e.status === "streaming")}
				motion={props.motion}
				theme={props.theme}
			/>
			{showCompletion ? <text fg={props.theme.completionMark}>{"  ·"}</text> : null}
			{props.error ? (
				<box marginTop={1}>
					<Notice kind="error" message={props.error} theme={props.theme} />
				</box>
			) : null}
		</box>
	);
}
