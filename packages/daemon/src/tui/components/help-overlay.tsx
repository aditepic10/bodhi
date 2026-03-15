import { Box, Text } from "ink";
import { tuiKeybindings } from "../keybindings";
import type { TuiTheme } from "../theme";
import { Surface } from "./primitives";

export function HelpOverlay(props: { theme: TuiTheme }) {
	return (
		<Surface bordered borderColor={props.theme.accent} theme={props.theme} title="Keybindings">
			{tuiKeybindings.map((binding) => (
				<Box key={binding.id} justifyContent="space-between">
					<Text color={props.theme.text}>{binding.description}</Text>
					<Text color={props.theme.muted}>{binding.label}</Text>
				</Box>
			))}
		</Surface>
	);
}
