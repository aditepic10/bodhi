import type { TuiMotion } from "../config";
import type { TuiStatus } from "../state";
import type { TuiTheme } from "../theme";

function statusDot(status: TuiStatus, theme: TuiTheme): { color: string; glyph: string } {
	switch (status) {
		case "initializing":
			return { color: theme.dim, glyph: "○" };
		case "ready":
		case "idle":
			return { color: theme.statusReady, glyph: "●" };
		case "streaming":
			return { color: theme.statusStreaming, glyph: "●" };
		case "error":
			return { color: theme.error, glyph: "●" };
	}
}

function statusLabel(status: TuiStatus): string {
	switch (status) {
		case "initializing":
			return "waking";
		case "ready":
		case "idle":
			return "ready";
		case "streaming":
			return "thinking";
		case "error":
			return "error";
	}
}

export function StatusBar(props: { motion?: TuiMotion; status: TuiStatus; theme: TuiTheme }) {
	const dot = statusDot(props.status, props.theme);

	return (
		<box width="100%" flexDirection="row">
			<box flexGrow={1} flexDirection="row">
				<text fg={dot.color}>{dot.glyph} </text>
				<text fg={props.theme.dim}>{statusLabel(props.status)}</text>
			</box>
			<box gap={2} flexDirection="row">
				<text fg={props.theme.dim}>
					<span fg={props.theme.muted}>^S</span> sessions
				</text>
				<text fg={props.theme.dim}>
					<span fg={props.theme.muted}>Tab</span> focus
				</text>
				<text fg={props.theme.dim}>
					<span fg={props.theme.muted}>^C</span> exit
				</text>
			</box>
		</box>
	);
}
