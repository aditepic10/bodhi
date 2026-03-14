import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildBashHookBlock,
	buildZshHookBlock,
	defaultConfigPath,
	defaultRcPath,
	detectFirstRunStatus,
	detectShellDependencies,
	hasShellHook,
	installShellHook,
	renderFirstRunGuidance,
	uninstallShellHook,
} from "./shell";

describe("shell capture workflows", () => {
	test("zsh hook block includes unix socket, spool, jq, and uuid fallback behavior", () => {
		const block = buildZshHookBlock({
			dataDir: "/tmp/bodhi",
			socketPath: "/tmp/bodhi/bodhi.sock",
		});

		expect(block).toContain("# >>> bodhi >>>");
		expect(block).toContain("curl -s --max-time 0.1 --unix-socket");
		expect(block).toContain("spool.$$.jsonl");
		expect(block).toContain("jq -c -n");
		expect(block).toContain("python3 -");
		expect(block).toContain("uuidgen 2>/dev/null");
	});

	test("bash hook block installs prompt hooks with spool and json builder fallback", () => {
		const block = buildBashHookBlock({
			dataDir: "/tmp/bodhi",
			socketPath: "/tmp/bodhi/bodhi.sock",
		});

		expect(block).toContain("trap '__bodhi_preexec' DEBUG");
		expect(block).toContain("PROMPT_COMMAND=");
		expect(block).toContain("spool.$$.jsonl");
		expect(block).toContain("python3 -");
	});

	test("install and uninstall shell hook are marker-delimited and idempotent", () => {
		const dir = mkdtempSync(join(tmpdir(), "bodhi-shell-"));
		const rcPath = join(dir, ".zshrc");

		try {
			writeFileSync(rcPath, "export PATH=$PATH\n", "utf8");

			const first = installShellHook({
				dataDir: "/tmp/bodhi",
				rcPath,
				shell: "zsh",
				socketPath: "/tmp/bodhi/bodhi.sock",
			});
			const second = installShellHook({
				dataDir: "/tmp/bodhi",
				rcPath,
				shell: "zsh",
				socketPath: "/tmp/bodhi/bodhi.sock",
			});
			const installed = readFileSync(rcPath, "utf8");
			const removed = uninstallShellHook(rcPath);

			expect(first.changed).toBe(true);
			expect(second.changed).toBe(false);
			expect(hasShellHook(installed)).toBe(true);
			expect(installed.match(/# >>> bodhi >>>/g)?.length).toBe(1);
			expect(removed.changed).toBe(true);
			expect(hasShellHook(removed.contents)).toBe(false);
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("first-run detection reports missing config, hooks, and dependencies", () => {
		const dir = mkdtempSync(join(tmpdir(), "bodhi-shell-"));
		const zshrc = join(dir, ".zshrc");

		try {
			writeFileSync(zshrc, "# no bodhi yet\n", "utf8");
			const status = detectFirstRunStatus({
				commandExists: (command) => command === "python3",
				configPath: join(dir, "config.toml"),
				dataDir: join(dir, "data"),
				rcFiles: {
					zsh: zshrc,
				},
			});
			const guidance = renderFirstRunGuidance(status);

			expect(status.configExists).toBe(false);
			expect(status.dependencies.jq).toBe(false);
			expect(status.dependencies.python3).toBe(true);
			expect(status.hooksInstalled.zsh).toBe(false);
			expect(guidance).toContain("run `bodhi init`");
			expect(guidance).toContain("jq: missing");
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("dependency detection and default paths follow shell conventions", () => {
		const dependencies = detectShellDependencies((command) => command !== "jq");

		expect(dependencies).toEqual({
			jq: false,
			python3: true,
			uuidgen: true,
		});
		expect(defaultRcPath("zsh", "/Users/adit")).toBe("/Users/adit/.zshrc");
		expect(defaultRcPath("bash", "/Users/adit")).toBe("/Users/adit/.bashrc");
		expect(defaultConfigPath("/Users/adit")).toBe("/Users/adit/.config/bodhi/config.toml");
	});
});
