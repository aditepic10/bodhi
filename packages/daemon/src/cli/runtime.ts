import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config";
import { requestJson, requestSse } from "./http";
import type { CliRuntime } from "./types";

function defaultCommandExists(command: string): boolean {
	return Bun.which(command) !== null;
}

export function createCliRuntime(): CliRuntime {
	const daemonEntry = fileURLToPath(new URL("../daemon.ts", import.meta.url));
	return {
		argv: process.argv.slice(2),
		commandExists: defaultCommandExists,
		isProcessAlive(pid: number) {
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		},
		loadConfig,
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
