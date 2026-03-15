import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config";
import { requestJson, requestSse } from "./http";
import type { CliLineReader, CliRuntime } from "./types";

function defaultCommandExists(command: string): boolean {
	return Bun.which(command) !== null;
}

function createDefaultLineReader(): CliLineReader {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	});

	return {
		close() {
			rl.close();
		},
		readLine(prompt: string) {
			return new Promise((resolve) => {
				let settled = false;
				const cleanup = () => {
					rl.off("close", handleClose);
					rl.off("SIGINT", handleSigint);
				};
				const finish = (value: string | null) => {
					if (settled) {
						return;
					}
					settled = true;
					cleanup();
					resolve(value);
				};
				const handleClose = () => {
					finish(null);
				};
				const handleSigint = () => {
					rl.close();
					finish(null);
				};

				rl.once("close", handleClose);
				rl.once("SIGINT", handleSigint);
				rl.question(prompt, (answer) => {
					finish(answer);
				});
			});
		},
	};
}

export function createCliRuntime(): CliRuntime {
	const daemonEntry = fileURLToPath(new URL("../daemon.ts", import.meta.url));
	return {
		argv: process.argv.slice(2),
		commandExists: defaultCommandExists,
		createLineReader: createDefaultLineReader,
		cwd() {
			return process.cwd();
		},
		isInteractiveTerminal() {
			return Boolean(process.stdin.isTTY && process.stdout.isTTY);
		},
		isProcessAlive(pid: number) {
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		},
		loadConfig,
		onSignal(signal: NodeJS.Signals, handler: () => void) {
			process.on(signal, handler);
			return () => {
				process.off(signal, handler);
			};
		},
		readStdin() {
			return new Response(Bun.stdin.stream()).text();
		},
		requestJson,
		requestSse,
		sleep(ms: number) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		},
		signalProcess(pid: number, signal: NodeJS.Signals) {
			process.kill(pid, signal);
		},
		spawnDaemon(config) {
			const startupLogPath = join(config.data_dir, "daemon-startup.log");
			const startupLogFd = openSync(startupLogPath, "a");
			const child = spawn(process.execPath, ["run", daemonEntry], {
				detached: true,
				env: process.env,
				stdio: ["ignore", startupLogFd, startupLogFd],
			});
			return {
				pid: child.pid,
				startupLogPath,
				unref() {
					child.unref();
				},
			};
		},
		stderr: process.stderr,
		stdout: process.stdout,
	};
}
