import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

function commandAvailable(command: string): boolean {
	try {
		execFileSync("/bin/sh", ["-c", `command -v ${command} >/dev/null 2>&1`], {
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

function gitEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		GIT_AUTHOR_EMAIL: "bodhi@example.com",
		GIT_AUTHOR_NAME: "Bodhi Test",
		GIT_COMMITTER_EMAIL: "bodhi@example.com",
		GIT_COMMITTER_NAME: "Bodhi Test",
	};
}

function runShellContext(
	shell: "bash" | "zsh",
	repoPath: string,
	tool: string,
): Record<string, string> {
	const block =
		shell === "zsh"
			? buildZshHookBlock({
					dataDir: "/tmp/bodhi",
					socketPath: "/tmp/bodhi/bodhi.sock",
				})
			: buildBashHookBlock({
					dataDir: "/tmp/bodhi",
					socketPath: "/tmp/bodhi/bodhi.sock",
				});

	const command =
		shell === "zsh"
			? `source "$1"\ncd "$2"\n__bodhi_context_json "$PWD" "$3"\n`
			: `. "$1"\ncd "$2"\n__bodhi_context_json "$PWD" "$3"\n`;

	const output = execFileSync(shell, ["-c", command, shell, "/dev/stdin", repoPath, tool], {
		encoding: "utf8",
		input: block,
	});

	return JSON.parse(output) as Record<string, string>;
}

function canonicalPath(path: string): string {
	return realpathSync(path);
}

function initGitRepo(repoPath: string): void {
	execFileSync("git", ["init", "-b", "main", repoPath], {
		env: gitEnv(),
		stdio: "ignore",
	});
	writeFileSync(join(repoPath, "README.md"), "hello\n", "utf8");
	execFileSync("git", ["-C", repoPath, "add", "README.md"], {
		env: gitEnv(),
		stdio: "ignore",
	});
	execFileSync("git", ["-C", repoPath, "commit", "-m", "initial"], {
		env: gitEnv(),
		stdio: "ignore",
	});
}

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
		expect(block).toContain("__bodhi_context_json");
		expect(block).toContain("rev-parse --git-common-dir");
		expect(block).toContain("rev-parse --show-toplevel");
		expect(block).toContain("symbolic-ref --short HEAD");
		expect(block).toContain("terminal_session");
		expect(block).toContain('context=$(__bodhi_context_json "$PWD" "shell.zsh"');
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
		expect(block).toContain("__bodhi_terminal_session");
		expect(block).toContain("__bodhi_git_state");
		expect(block).toContain('context=$(__bodhi_context_json "$PWD" "shell.bash"');
		expect(block).toContain('"repo_id"');
		expect(block).toContain('"worktree_root"');
		expect(block).toContain('"relative_cwd"');
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

	test("bash hook context helper derives repo and worktree context in a normal repo", () => {
		const dir = mkdtempSync(join(tmpdir(), "bodhi-shell-int-"));
		const repoPath = join(dir, "bodhi");

		try {
			initGitRepo(repoPath);
			const packagePath = join(repoPath, "packages", "daemon");
			mkdirSync(packagePath, { recursive: true });

			const context = runShellContext("bash", packagePath, "shell.bash");

			expect(context.repo_id).toBe(canonicalPath(join(repoPath, ".git")));
			expect(context.worktree_root).toBe(canonicalPath(repoPath));
			expect(context.branch).toBe("main");
			expect(context.cwd).toBe(canonicalPath(packagePath));
			expect(context.relative_cwd).toBe("packages/daemon");
			expect(context.tool).toBe("shell.bash");
			expect(context.head_sha).toBeDefined();
			expect(context.git_state).toBe("normal");
			expect(context.terminal_session).toBeDefined();
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("zsh hook context helper derives worktree-aware context", () => {
		if (!commandAvailable("zsh")) {
			return;
		}

		const dir = mkdtempSync(join(tmpdir(), "bodhi-shell-int-"));
		const repoPath = join(dir, "bodhi");
		const worktreePath = join(dir, "bodhi-auth");

		try {
			initGitRepo(repoPath);
			execFileSync("git", ["-C", repoPath, "worktree", "add", "-b", "feature/auth", worktreePath], {
				env: gitEnv(),
				stdio: "ignore",
			});
			const nestedPath = join(worktreePath, "packages", "daemon");
			mkdirSync(nestedPath, { recursive: true });

			const context = runShellContext("zsh", nestedPath, "shell.zsh");

			expect(context.repo_id).toBe(canonicalPath(join(repoPath, ".git")));
			expect(context.worktree_root).toBe(canonicalPath(worktreePath));
			expect(context.branch).toBe("feature/auth");
			expect(context.cwd).toBe(canonicalPath(nestedPath));
			expect(context.relative_cwd).toBe("packages/daemon");
			expect(context.tool).toBe("shell.zsh");
			expect(context.git_state).toBe("normal");
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("bash hook context helper marks detached head and still captures head sha", () => {
		const dir = mkdtempSync(join(tmpdir(), "bodhi-shell-int-"));
		const repoPath = join(dir, "bodhi");

		try {
			initGitRepo(repoPath);
			execFileSync("git", ["-C", repoPath, "checkout", "--detach", "HEAD"], {
				env: gitEnv(),
				stdio: "ignore",
			});

			const context = runShellContext("bash", repoPath, "shell.bash");

			expect(context.branch).toBeUndefined();
			expect(context.head_sha).toBeDefined();
			expect(context.git_state).toBe("detached");
			expect(context.repo_id).toBe(canonicalPath(join(repoPath, ".git")));
			expect(context.worktree_root).toBe(canonicalPath(repoPath));
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("bash hook context helper emits ambient context outside git repos", () => {
		const dir = mkdtempSync(join(tmpdir(), "bodhi-shell-int-"));

		try {
			const context = runShellContext("bash", dir, "shell.bash");

			expect(context.repo_id).toBeUndefined();
			expect(context.worktree_root).toBeUndefined();
			expect(context.branch).toBeUndefined();
			expect(context.head_sha).toBeUndefined();
			expect(context.cwd).toBe(canonicalPath(dir));
			expect(context.tool).toBe("shell.bash");
			expect(context.terminal_session).toBeDefined();
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});
});
