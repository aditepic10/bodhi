import type { ChatSessionListEntry } from "@bodhi/types";
import type { TuiTheme } from "../theme";
import { LoadingState, Surface } from "./primitives";

function label(session: ChatSessionListEntry): string {
	return session.title ?? session.last_user_message_preview ?? "(empty session)";
}

export function SessionSwitcher(props: {
	loading?: boolean;
	selectedIndex: number;
	sessions: ChatSessionListEntry[];
	theme: TuiTheme;
}) {
	return (
		<Surface bordered borderColor={props.theme.accent} theme={props.theme} title="Sessions">
			{props.loading ? (
				<LoadingState message="Loading sessions…" theme={props.theme} />
			) : props.sessions.length === 0 ? (
				<text fg={props.theme.dim}>No sessions yet.</text>
			) : (
				props.sessions.slice(0, 6).map((session, index) => (
					<box key={session.session_id}>
						<text fg={index === props.selectedIndex ? props.theme.accent : props.theme.text}>
							{index === props.selectedIndex ? "›" : " "} {session.session_id.slice(0, 12)} ·{" "}
							{label(session)}
						</text>
					</box>
				))
			)}
		</Surface>
	);
}
