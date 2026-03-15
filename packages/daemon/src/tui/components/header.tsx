import type { ChatSession } from "@bodhi/types";
import type { TuiTheme } from "../theme";

export function Header(props: { session: ChatSession | null; theme: TuiTheme }) {
	const branch = props.session?.branch;
	const label = branch ?? (props.session ? props.session.session_id.slice(0, 12) : "new");

	return (
		<box flexDirection="row">
			<text fg={props.theme.headerBrand}>
				<b>bodhi</b>
			</text>
			<text fg={props.theme.separator}> · </text>
			<text fg={props.theme.dim}>{label}</text>
		</box>
	);
}
