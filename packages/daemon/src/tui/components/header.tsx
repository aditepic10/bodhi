import type { ChatSession } from "@bodhi/types";
import { Box, Text } from "ink";
import type { TuiTheme } from "../theme";

export function Header(props: { session: ChatSession | null; theme: TuiTheme }) {
	const sessionLabel = props.session ? props.session.session_id.slice(0, 12) : "new";
	const branch = props.session?.branch;

	return (
		<Box>
			<Text bold color={props.theme.text}>
				bodhi
			</Text>
			<Text color={props.theme.dim}> · </Text>
			<Text color={props.theme.accent}>{sessionLabel}</Text>
			{branch ? (
				<>
					<Text color={props.theme.dim}> · </Text>
					<Text color={props.theme.muted}>{branch}</Text>
				</>
			) : null}
		</Box>
	);
}
