#!/usr/bin/env bun
import { runCli } from "./cli/commands";

export { runCli } from "./cli/commands";
export { requestJson, requestSse } from "./cli/http";
export type { CliRuntime } from "./cli/types";

async function main(): Promise<void> {
	try {
		const code = await runCli();
		if (code !== 0) {
			process.exit(code);
		}
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}

if (import.meta.main) {
	await main();
}
