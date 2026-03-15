import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { writeLine } from "../cli/helpers";
import type { CliRuntime } from "../cli/types";
import { BodhiTuiApp } from "./app";
import { loadTuiConfig } from "./config";
import { resolveTuiTheme } from "./theme";

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

	const renderer = await createCliRenderer({
		exitOnCtrlC: false,
		useMouse: true,
		useAlternateScreen: true,
	});

	createRoot(renderer).render(
		<BodhiTuiApp
			config={tuiConfig}
			onSessionChange={(nextSessionId: string) => {
				sessionId = nextSessionId;
			}}
			resumeSessionId={options.resumeSessionId}
			runtime={runtime}
			theme={theme}
		/>,
	);

	renderer.start();

	try {
		await new Promise<void>((resolve) => {
			renderer.on("destroy", resolve);
		});
		return 0;
	} finally {
		writeResumeHint(runtime, sessionId);
	}
}
