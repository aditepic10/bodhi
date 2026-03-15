import { render } from "ink";
import React from "react";
import { writeLine } from "../cli/helpers";
import type { CliRuntime } from "../cli/types";
import { BodhiTuiApp } from "./app";
import { loadTuiConfig } from "./config";
import { resolveTuiTheme } from "./theme";

const ENTER_ALT_SCREEN = "\u001B[?1049h";
const EXIT_ALT_SCREEN = "\u001B[?1049l";

function writeResumeHint(runtime: CliRuntime, sessionId: string | null): void {
	if (!sessionId) {
		return;
	}

	writeLine(runtime.stdout);
	writeLine(runtime.stdout, "Resume this session with:");
	writeLine(runtime.stdout, `bodhi --resume ${sessionId}`);
}

export async function runTui(
	runtime: CliRuntime,
	options: { resumeSessionId?: string } = {},
): Promise<number> {
	const bodhiConfig = runtime.loadConfig();
	const tuiConfig = loadTuiConfig(bodhiConfig);
	const theme = resolveTuiTheme(tuiConfig);
	let sessionId = options.resumeSessionId ?? null;
	runtime.stdout.write(ENTER_ALT_SCREEN);
	const instance = render(
		React.createElement(BodhiTuiApp, {
			config: tuiConfig,
			onSessionChange(nextSessionId: string) {
				sessionId = nextSessionId;
			},
			resumeSessionId: options.resumeSessionId,
			runtime,
			theme,
		}),
		{
			exitOnCtrlC: false,
			incrementalRendering: false,
			maxFps: 30,
			patchConsole: false,
			stderr: process.stderr,
			stdin: process.stdin,
			stdout: process.stdout,
		},
	);

	try {
		await instance.waitUntilExit();
		return 0;
	} finally {
		instance.cleanup();
		runtime.stdout.write(EXIT_ALT_SCREEN);
		writeResumeHint(runtime, sessionId);
	}
}
