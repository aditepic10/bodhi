import { existsSync, writeFileSync } from "node:fs";
import {
	type AssistantInstallScope,
	AssistantInstallScopeSchema,
	listAssistantCaptureAdapters,
} from "../capture/ai";
import { installGitHooks } from "../capture/git";
import {
	defaultRcPath,
	detectShellDependencies,
	installShellHook,
	type SupportedShell,
} from "../capture/shell";
import { handleAiCapture } from "./ai-capture";
import {
	configPathFor,
	ensureCliConfigDirs,
	formatBytes,
	formatTimestamp,
	formatUptime,
	HELP_TEXT,
	POLL_INTERVAL_MS,
	readPid,
	readRecentLogLines,
	readStatusSnapshot,
	renderDefaultConfigToml,
	STOP_TIMEOUT_MS,
	waitForHealth,
	writeLine,
} from "./helpers";
import { createCliRuntime } from "./runtime";
import type { CliRuntime, HealthResponse } from "./types";

interface InitOptions {
	assistantScope: AssistantInstallScope;
}

function parseInitOptions(args: readonly string[]): InitOptions | null {
	let assistantScope: AssistantInstallScope = "global";

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}

		if (arg === "--assistant-scope") {
			const next = args[index + 1];
			const parsed = AssistantInstallScopeSchema.safeParse(next);
			if (!parsed.success) {
				return null;
			}
			assistantScope = parsed.data;
			index += 1;
			continue;
		}

		if (arg.startsWith("--assistant-scope=")) {
			const parsed = AssistantInstallScopeSchema.safeParse(arg.slice("--assistant-scope=".length));
			if (!parsed.success) {
				return null;
			}
			assistantScope = parsed.data;
			continue;
		}

		return null;
	}

	return { assistantScope };
}

async function handleInit(runtime: CliRuntime, args: readonly string[]): Promise<number> {
	const options = parseInitOptions(args);
	if (!options) {
		writeLine(runtime.stderr, "Usage: bodhi init [--assistant-scope global|project|none]");
		return 1;
	}

	const config = runtime.loadConfig();
	const configPath = configPathFor(config);
	ensureCliConfigDirs(config);

	if (!existsSync(configPath)) {
		writeFileSync(configPath, renderDefaultConfigToml(config), { mode: 0o600 });
	}

	const dependencies = detectShellDependencies(runtime.commandExists);
	for (const shell of ["zsh", "bash"] as const satisfies readonly SupportedShell[]) {
		const rcPath = defaultRcPath(shell);
		installShellHook({
			dataDir: config.data_dir,
			rcPath,
			shell,
			socketPath: config.socket_path,
		});
		writeLine(runtime.stdout, `Installed ${shell} hook: ${rcPath}`);
	}

	const gitHooks = installGitHooks({
		cwd: runtime.cwd(),
		dataDir: config.data_dir,
		socketPath: config.socket_path,
	});
	if (gitHooks.skippedReason === "not-a-git-repo") {
		writeLine(runtime.stdout, "Skipped git hooks: current directory is not a git repo");
	} else if (gitHooks.skippedReason === "git-not-found") {
		writeLine(runtime.stderr, "Warning: git not found; git lifecycle hooks were not installed");
	} else if (gitHooks.hooksDir) {
		writeLine(runtime.stdout, `Installed git hooks: ${gitHooks.hooksDir}`);
	}

	if (options.assistantScope === "none") {
		writeLine(runtime.stdout, "Skipped assistant integrations: assistant scope set to none");
	} else {
		for (const adapter of listAssistantCaptureAdapters()) {
			const installPath = adapter.install(options.assistantScope, runtime.cwd());
			writeLine(
				runtime.stdout,
				`Installed ${adapter.displayName} integration (${options.assistantScope}): ${installPath}`,
			);
		}
	}

	writeLine(runtime.stdout, `Config: ${configPath}`);
	if (!dependencies.uuidgen) {
		writeLine(
			runtime.stderr,
			"Warning: uuidgen not found; shell hooks will use a weaker fallback id",
		);
	}
	if (!dependencies.jq) {
		writeLine(
			runtime.stderr,
			dependencies.python3
				? "Warning: jq not found; shell hooks will fall back to python3 JSON encoding"
				: "Warning: jq and python3 not found; shell capture cannot serialize events safely",
		);
	}

	return 0;
}

async function handleStart(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	const existingPid = readPid(config);
	if (existingPid && runtime.isProcessAlive(existingPid)) {
		const health = await waitForHealth(runtime, config, existingPid);
		writeLine(runtime.stdout, `Bodhi already running (pid ${existingPid})`);
		writeLine(
			runtime.stdout,
			config.transport === "unix"
				? `Socket: ${config.socket_path}`
				: `Address: http://${config.host}:${config.port}`,
		);
		writeLine(runtime.stdout, `Intel: ${health.components.intel}`);
		return 0;
	}

	const child = runtime.spawnDaemon(config);
	child.unref();
	if (!child.pid) {
		throw new Error("failed to spawn daemon");
	}

	try {
		await waitForHealth(runtime, config, child.pid);
	} catch (error) {
		const startupLog = child.startupLogPath ? readRecentLogLines(child.startupLogPath) : [];
		const tail = startupLog.length > 0 ? `\n${startupLog.join("\n")}` : "";
		throw new Error(
			`daemon failed to start: ${error instanceof Error ? error.message : String(error)}${tail}\nRun \`bun run --filter @bodhi/daemon dev\` for foreground logs.`,
		);
	}
	writeLine(runtime.stdout, `Bodhi started (pid ${child.pid})`);
	writeLine(
		runtime.stdout,
		config.transport === "unix"
			? `Socket: ${config.socket_path}`
			: `Address: http://${config.host}:${config.port}`,
	);
	return 0;
}

async function handleStop(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	const pid = readPid(config);
	if (!pid) {
		writeLine(runtime.stderr, "Bodhi is not running");
		return 1;
	}

	runtime.signalProcess(pid, "SIGTERM");
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (!runtime.isProcessAlive(pid)) {
			writeLine(runtime.stdout, `Bodhi stopped (pid ${pid})`);
			return 0;
		}
		await runtime.sleep(POLL_INTERVAL_MS);
	}

	throw new Error(`timed out waiting for pid ${pid} to exit`);
}

async function handleStatus(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	let health: HealthResponse;
	try {
		const response = await runtime.requestJson<HealthResponse>(config, "/health", {
			authenticated: false,
		});
		health = response.body;
	} catch {
		writeLine(runtime.stdout, "Status: stopped");
		return 1;
	}

	const snapshot = readStatusSnapshot(config);
	writeLine(runtime.stdout, `Status: ${health.ok ? "running" : "degraded"}`);
	writeLine(runtime.stdout, `Uptime: ${formatUptime(health.uptime)}`);
	writeLine(runtime.stdout, `Event count: ${snapshot.eventCount}`);
	writeLine(runtime.stdout, `DB size: ${formatBytes(snapshot.dbSizeBytes)}`);
	writeLine(runtime.stdout, `Last event: ${formatTimestamp(snapshot.lastEventAt)}`);
	writeLine(runtime.stdout, `Pending facts: ${snapshot.pendingFacts}`);
	writeLine(runtime.stdout, `Intel: ${health.components.intel}`);
	writeLine(runtime.stdout, `Spool files: ${health.components.spool_files}`);
	writeLine(runtime.stdout, `Disk free: ${health.components.disk_free_mb} MB`);
	return 0;
}

async function handleRecall(runtime: CliRuntime, args: readonly string[]): Promise<number> {
	const message = args.join(" ").trim();
	if (!message) {
		writeLine(runtime.stderr, 'Usage: bodhi recall "query"');
		return 1;
	}

	const config = runtime.loadConfig();
	await runtime.requestSse(config, "/agent", { message }, (payload) => {
		switch (payload.type) {
			case "text-delta":
				runtime.stdout.write(String(payload.text ?? ""));
				break;
			case "error":
				throw new Error(String(payload.error ?? "agent request failed"));
			default:
				break;
		}
	});
	writeLine(runtime.stdout);
	return 0;
}

export async function runCli(
	argv: readonly string[] = process.argv.slice(2),
	runtime: CliRuntime = createCliRuntime(),
): Promise<number> {
	const [command, ...args] = argv;
	switch (command) {
		case undefined:
		case "-h":
		case "--help":
		case "help":
			writeLine(runtime.stdout, HELP_TEXT);
			return 0;
		case "init":
			return handleInit(runtime, args);
		case "start":
			return handleStart(runtime);
		case "stop":
			return handleStop(runtime);
		case "status":
			return handleStatus(runtime);
		case "recall":
			return handleRecall(runtime, args);
		case "internal":
			if (args[0] === "ai-capture") {
				return handleAiCapture(runtime, args.slice(1));
			}
			writeLine(runtime.stderr, `Unknown internal command: ${args.join(" ")}`);
			return 1;
		default:
			writeLine(runtime.stderr, `Unknown command: ${command}`);
			writeLine(runtime.stderr, HELP_TEXT);
			return 1;
	}
}
