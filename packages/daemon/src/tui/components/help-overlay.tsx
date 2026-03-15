import { tuiKeybindings } from "../keybindings";
import type { TuiTheme } from "../theme";
import { Surface } from "./primitives";

export function HelpOverlay(props: { theme: TuiTheme }) {
	return (
		<Surface bordered borderColor={props.theme.accent} theme={props.theme} title="Keybindings">
			{tuiKeybindings.map((binding) => (
				<box key={binding.id} flexDirection="row" justifyContent="space-between">
					<text fg={props.theme.text}>{binding.description}</text>
					<text fg={props.theme.muted}>{binding.label}</text>
				</box>
			))}
		</Surface>
	);
}
