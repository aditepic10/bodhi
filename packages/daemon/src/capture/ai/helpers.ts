import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ActivityContext, BodhiConfig, BodhiEvent } from "@bodhi/types";

function runGit(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", ["-C", cwd, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

function resolvePath(baseDir: string, rawPath: string | null): string | undefined {
	if (!rawPath) {
		return undefined;
	}

	try {
		return rawPath.startsWith("/")
			? realpathSync(rawPath)
			: realpathSync(resolve(baseDir, rawPath));
	} catch {
		return rawPath.startsWith("/") ? rawPath : resolve(baseDir, rawPath);
	}
}

function detectGitState(gitDir: string, branch?: string): ActivityContext["git_state"] | undefined {
	try {
		if (existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"))) {
			return "rebasing";
		}
		if (existsSync(join(gitDir, "MERGE_HEAD"))) {
			return "merging";
		}
		if (existsSync(join(gitDir, "CHERRY_PICK_HEAD"))) {
			return "cherry-picking";
		}
		if (existsSync(join(gitDir, "REVERT_HEAD"))) {
			return "reverting";
		}
		if (existsSync(join(gitDir, "BISECT_LOG"))) {
			return "bisecting";
		}
		if (!branch) {
			return "detached";
		}
		return "normal";
	} catch {
		return branch ? "normal" : undefined;
	}
}

function relativeCwd(worktreeRoot?: string, cwd?: string): string | undefined {
	if (!worktreeRoot || !cwd) {
		return undefined;
	}

	if (cwd === worktreeRoot) {
		return ".";
	}

	const prefix = `${worktreeRoot}/`;
	return cwd.startsWith(prefix) ? cwd.slice(prefix.length) : undefined;
}

export function deriveActivityContext(
	cwd: string | undefined,
	tool: string,
	threadId?: string,
): ActivityContext {
	const normalizedCwd = cwd ? (resolvePath(cwd, ".") ?? cwd) : undefined;
	const context: ActivityContext = {
		cwd: normalizedCwd,
		thread_id: threadId,
		tool,
	};

	if (!normalizedCwd) {
		return context;
	}

	const commonDir =
		resolvePath(
			normalizedCwd,
			runGit(normalizedCwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
		) ?? resolvePath(normalizedCwd, runGit(normalizedCwd, ["rev-parse", "--git-common-dir"]));
	const gitDir =
		resolvePath(
			normalizedCwd,
			runGit(normalizedCwd, ["rev-parse", "--path-format=absolute", "--git-dir"]),
		) ?? resolvePath(normalizedCwd, runGit(normalizedCwd, ["rev-parse", "--git-dir"]));
	const worktreeRoot =
		resolvePath(
			normalizedCwd,
			runGit(normalizedCwd, ["rev-parse", "--path-format=absolute", "--show-toplevel"]),
		) ?? resolvePath(normalizedCwd, runGit(normalizedCwd, ["rev-parse", "--show-toplevel"]));
	const branch = runGit(normalizedCwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]) ?? undefined;
	const headSha = runGit(normalizedCwd, ["rev-parse", "HEAD"]) ?? undefined;

	context.repo_id = commonDir;
	context.worktree_root = worktreeRoot;
	context.branch = branch;
	context.head_sha = headSha ?? undefined;
	context.git_state = gitDir ? detectGitState(gitDir, branch) : undefined;
	context.relative_cwd = relativeCwd(worktreeRoot, normalizedCwd);
	return context;
}

function spoolPath(config: BodhiConfig): string {
	return join(config.data_dir, `spool.${process.pid}.jsonl`);
}

export function stableEventId(seed?: string): string {
	if (!seed) {
		return randomUUID();
	}

	return `assistant-${Bun.hash(seed).toString(16)}`;
}

export function appendAssistantEventsToSpool(
	config: BodhiConfig,
	events: readonly BodhiEvent[],
): void {
	if (events.length === 0) {
		return;
	}

	const path = spoolPath(config);
	mkdirSync(dirname(path), { recursive: true });
	for (const event of events) {
		writeFileSync(path, `${JSON.stringify(event)}\n`, {
			encoding: "utf8",
			flag: "a",
			mode: 0o600,
		});
	}
	chmodSync(path, 0o600);
}

export function globalClaudeSettingsPath(): string {
	return join(process.env.HOME ?? homedir(), ".claude", "settings.json");
}

export function globalOpenCodePluginPath(): string {
	return join(process.env.HOME ?? homedir(), ".config", "opencode", "plugins", "bodhi.ts");
}
