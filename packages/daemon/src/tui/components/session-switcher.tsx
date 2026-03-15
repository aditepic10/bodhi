import type { ChatSessionListEntry } from "@bodhi/types";
import { Box, Text } from "ink";
import type { TuiTheme } from "../theme";
import { Surface } from "./primitives";

function label(session: ChatSessionListEntry): string {
	return session.title ?? session.last_user_message_preview ?? "(empty session)";
}

export function SessionSwitcher(props: {
	selectedIndex: number;
	sessions: ChatSessionListEntry[];
	theme: TuiTheme;
}) {
	return (
		<Surface bordered borderColor={props.theme.accent} theme={props.theme} title="Sessions">
			{props.sessions.length === 0 ? (
				<Text color={props.theme.dim}>No sessions yet.</Text>
			) : (
				props.sessions.slice(0, 6).map((session, index) => (
					<Box key={session.session_id}>
						<Text color={index === props.selectedIndex ? props.theme.accent : props.theme.text}>
							{index === props.selectedIndex ? "›" : " "} {session.session_id.slice(0, 12)} ·{" "}
							{label(session)}
						</Text>
					</Box>
				))
			)}
		</Surface>
	);
}
