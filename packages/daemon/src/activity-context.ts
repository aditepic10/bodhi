import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { ActivityContext } from "@bodhi/types";

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
		if (
			existsSync(resolve(gitDir, "rebase-merge")) ||
			existsSync(resolve(gitDir, "rebase-apply"))
		) {
			return "rebasing";
		}
		if (existsSync(resolve(gitDir, "MERGE_HEAD"))) {
			return "merging";
		}
		if (existsSync(resolve(gitDir, "CHERRY_PICK_HEAD"))) {
			return "cherry-picking";
		}
		if (existsSync(resolve(gitDir, "REVERT_HEAD"))) {
			return "reverting";
		}
		if (existsSync(resolve(gitDir, "BISECT_LOG"))) {
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

export interface WorkspaceContext {
	branch?: string;
	cwd?: string;
	repo_id?: string;
	worktree_root?: string;
}

export function deriveWorkspaceContext(cwd?: string): WorkspaceContext {
	const normalizedCwd = cwd ? (resolvePath(cwd, ".") ?? cwd) : undefined;
	if (!normalizedCwd) {
		return {};
	}

	const commonDir =
		resolvePath(
			normalizedCwd,
			runGit(normalizedCwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
		) ?? resolvePath(normalizedCwd, runGit(normalizedCwd, ["rev-parse", "--git-common-dir"]));
	const worktreeRoot =
		resolvePath(
			normalizedCwd,
			runGit(normalizedCwd, ["rev-parse", "--path-format=absolute", "--show-toplevel"]),
		) ?? resolvePath(normalizedCwd, runGit(normalizedCwd, ["rev-parse", "--show-toplevel"]));
	const branch = runGit(normalizedCwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]) ?? undefined;

	return {
		branch,
		cwd: normalizedCwd,
		repo_id: commonDir,
		worktree_root: worktreeRoot,
	};
}

export function deriveActivityContext(
	cwd: string | undefined,
	tool: string,
	threadId?: string,
): ActivityContext {
	const workspace = deriveWorkspaceContext(cwd);
	const context: ActivityContext = {
		branch: workspace.branch,
		cwd: workspace.cwd,
		repo_id: workspace.repo_id,
		thread_id: threadId,
		tool,
		worktree_root: workspace.worktree_root,
	};

	if (!workspace.cwd) {
		return context;
	}

	const gitDir =
		resolvePath(
			workspace.cwd,
			runGit(workspace.cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]),
		) ?? resolvePath(workspace.cwd, runGit(workspace.cwd, ["rev-parse", "--git-dir"]));
	const headSha = runGit(workspace.cwd, ["rev-parse", "HEAD"]) ?? undefined;

	context.head_sha = headSha;
	context.git_state = gitDir ? detectGitState(gitDir, workspace.branch) : undefined;
	context.relative_cwd = relativeCwd(workspace.worktree_root, workspace.cwd);
	return context;
}
