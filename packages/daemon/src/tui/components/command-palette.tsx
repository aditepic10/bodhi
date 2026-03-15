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
				<box key={action.id} flexDirection="row" justifyContent="space-between">
					<text fg={index === props.selectedIndex ? props.theme.accent : props.theme.text}>
						{index === props.selectedIndex ? "›" : " "} {action.label}
					</text>
					<text fg={props.theme.dim}>{action.description}</text>
				</box>
			))}
		</Surface>
	);
}
