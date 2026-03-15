import { Box, Text } from "ink";
import type { PropsWithChildren } from "react";
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
		<Box
			borderColor={bordered ? (borderColor ?? theme.border) : undefined}
			borderStyle={bordered ? "round" : undefined}
			flexDirection="column"
			width={fillWidth ? "100%" : undefined}
			paddingX={paddingX}
			paddingY={paddingY}
		>
			{title ? (
				<Box marginBottom={compact ? 0 : 1}>
					<Text bold color={theme.muted}>
						{title}
					</Text>
				</Box>
			) : null}
			{children}
		</Box>
	);
}

export function Divider(props: { theme: TuiTheme; width: number }) {
	return <Text color={props.theme.separator}>{"─".repeat(Math.max(1, props.width))}</Text>;
}

export function Badge(props: { color: string; label: string }) {
	return (
		<Text bold color={props.color}>
			[{props.label}]
		</Text>
	);
}

export function EmptyState(props: { message: string; theme: TuiTheme }) {
	return (
		<Box>
			<Text color={props.theme.dim}>○ </Text>
			<Text color={props.theme.muted}>{props.message}</Text>
		</Box>
	);
}

export function LoadingState(props: { message: string; theme: TuiTheme }) {
	return (
		<Box>
			<Text color={props.theme.accent}>··· </Text>
			<Text color={props.theme.text}>{props.message}</Text>
		</Box>
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
		<Box>
			<Text color={color}>▎ </Text>
			<Text color={color}>{props.message}</Text>
		</Box>
	);
}

export function ThinkingState(props: { active: boolean; theme: TuiTheme }) {
	if (!props.active) {
		return null;
	}

	return (
		<Box>
			<Text color={props.theme.dim}>··· breathing in context…</Text>
		</Box>
	);
}
