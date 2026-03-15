import { Box, Text } from "ink";
import type { TuiTheme } from "../theme";
import { Surface } from "./primitives";

export interface CommandPaletteAction {
	description: string;
	id: "exit" | "help" | "sessions";
	label: string;
}

export const commandPaletteActions: CommandPaletteAction[] = [
	{ description: "Switch sessions", id: "sessions", label: "Sessions" },
	{ description: "Open help", id: "help", label: "Help" },
	{ description: "Exit Bodhi", id: "exit", label: "Exit" },
];

export function CommandPalette(props: { selectedIndex: number; theme: TuiTheme }) {
	return (
		<Surface bordered borderColor={props.theme.accent} theme={props.theme} title="Actions">
			{commandPaletteActions.map((action, index) => (
				<Box key={action.id} justifyContent="space-between">
					<Text color={index === props.selectedIndex ? props.theme.accent : props.theme.text}>
						{index === props.selectedIndex ? "›" : " "} {action.label}
					</Text>
					<Text color={props.theme.dim}>{action.description}</Text>
				</Box>
			))}
		</Surface>
	);
}
