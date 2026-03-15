import { Box, Text } from "ink";
import type { TuiTheme } from "../theme";

export function StatusBar(props: { sessionCount: number; status: string; theme: TuiTheme }) {
	return (
		<Box justifyContent="space-between">
			<Text color={props.theme.dim}>{props.status}</Text>
			<Text color={props.theme.dim}>
				^S sessions · ? help · / actions · {props.sessionCount} tracked
			</Text>
		</Box>
	);
}
