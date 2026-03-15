import { useTerminalDimensions } from "@opentui/react";
import type { TuiTheme } from "../theme";

export function WelcomeState(props: { theme: TuiTheme }) {
	const { width } = useTerminalDimensions();
	const narrow = width < 40;

	return (
		<box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			flexGrow={1}
			width="100%"
		>
			{narrow ? (
				<text fg={props.theme.welcome}>
					<b>bodhi</b>
				</text>
			) : (
				<ascii-font text="bodhi" font="tiny" color={props.theme.welcome} />
			)}
			<box marginTop={1}>
				<text fg={props.theme.welcomeDim}>pick up where you left off</text>
			</box>
		</box>
	);
}
