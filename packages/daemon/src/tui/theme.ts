import type { TuiConfig } from "./config";

export interface TuiTheme {
	accent: string;
	background: string;
	border: string;
	dim: string;
	error: string;
	muted: string;
	panel: string;
	separator: string;
	success: string;
	text: string;
	toolDim: string;
	warning: string;
}

const darkTheme: TuiTheme = {
	accent: "#8fb7a6",
	background: "#111615",
	border: "#2b3533",
	dim: "#6d7a75",
	error: "#d17c77",
	muted: "#95a19c",
	panel: "#18201e",
	separator: "#222d2a",
	success: "#8fc08a",
	text: "#e3ece7",
	toolDim: "#576661",
	warning: "#d4b67a",
};

export function resolveTuiTheme(_config: TuiConfig): TuiTheme {
	return darkTheme;
}
