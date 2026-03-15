import type { TuiConfig } from "./config";

export interface TuiTheme {
	accent: string;
	assistantBar: string;
	assistantLabel: string;
	background: string;
	border: string;
	completionMark: string;
	dim: string;
	error: string;
	headerBrand: string;
	muted: string;
	panel: string;
	separator: string;
	statusReady: string;
	statusStreaming: string;
	success: string;
	text: string;
	toolDim: string;
	toolIcon: string;
	userLabel: string;
	warning: string;
	welcome: string;
	welcomeDim: string;
}

const darkTheme: TuiTheme = {
	accent: "#8fb7a6",
	assistantBar: "#2d3a36",
	assistantLabel: "#a3cebb",
	background: "#111615",
	border: "#3d4e4a",
	completionMark: "#2d3a36",
	dim: "#8a9994",
	error: "#d17c77",
	headerBrand: "#8fb7a6",
	muted: "#95a19c",
	panel: "#18201e",
	separator: "#3a4a46",
	statusReady: "#6a9a72",
	statusStreaming: "#d4b67a",
	success: "#8fc08a",
	text: "#e3ece7",
	toolDim: "#7d8e88",
	toolIcon: "#6a8a80",
	userLabel: "#d4b67a",
	warning: "#d4b67a",
	welcome: "#8fb7a6",
	welcomeDim: "#5a7a70",
};

export function resolveTuiTheme(_config: TuiConfig): TuiTheme {
	return darkTheme;
}
