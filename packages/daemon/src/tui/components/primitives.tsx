import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import type { TuiMotion } from "../config";
import type { TuiTheme } from "../theme";

interface SurfaceProps extends PropsWithChildren {
	borderColor?: string;
	bordered?: boolean;
	compact?: boolean;
	fillWidth?: boolean;
	paddingX?: number;
	paddingY?: number;
	theme: TuiTheme;
	title?: string;
}

export function Surface({
	borderColor,
	bordered = false,
	children,
	compact = false,
	fillWidth = false,
	paddingX = 1,
	paddingY = 0,
	theme,
	title,
}: SurfaceProps) {
	return (
		<box
			borderColor={bordered ? (borderColor ?? theme.border) : undefined}
			borderStyle={bordered ? "rounded" : undefined}
			flexDirection="column"
			width={fillWidth ? "100%" : undefined}
			paddingX={paddingX}
			paddingY={paddingY}
		>
			{title ? (
				<box marginBottom={compact ? 0 : 1}>
					<text fg={theme.muted}>{title}</text>
				</box>
			) : null}
			{children}
		</box>
	);
}

export function Divider(props: { theme: TuiTheme; width: number }) {
	return <text fg={props.theme.separator}>{"─".repeat(Math.max(1, props.width))}</text>;
}

export function Badge(props: { color: string; label: string }) {
	return <text fg={props.color}>[{props.label}]</text>;
}

export function EmptyState(props: { message: string; theme: TuiTheme }) {
	return (
		<box flexDirection="row">
			<text fg={props.theme.dim}>○ </text>
			<text fg={props.theme.muted}>{props.message}</text>
		</box>
	);
}

export function LoadingState(props: { message: string; theme: TuiTheme }) {
	return (
		<box flexDirection="row">
			<text fg={props.theme.accent}>··· </text>
			<text fg={props.theme.text}>{props.message}</text>
		</box>
	);
}

export function Notice(props: {
	kind: "error" | "info" | "success";
	message: string;
	theme: TuiTheme;
}) {
	const color =
		props.kind === "error"
			? props.theme.error
			: props.kind === "success"
				? props.theme.success
				: props.theme.accent;
	return (
		<box flexDirection="row">
			<text fg={color}>▎ </text>
			<text fg={color}>{props.message}</text>
		</box>
	);
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function ThinkingState(props: { active: boolean; motion?: TuiMotion; theme: TuiTheme }) {
	const [frame, setFrame] = useState(0);
	const motion = props.motion ?? "full";

	useEffect(() => {
		if (!props.active || motion === "none") return;
		const ms = motion === "reduced" ? 400 : 80;
		const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), ms);
		return () => clearInterval(id);
	}, [props.active, motion]);

	if (!props.active) {
		return null;
	}

	const glyph = motion === "none" ? "▪" : (SPINNER[frame % SPINNER.length] ?? "⠋");

	return (
		<box flexDirection="row">
			<text fg={props.theme.statusStreaming}>{glyph} </text>
			<text fg={props.theme.dim}>thinking</text>
		</box>
	);
}
