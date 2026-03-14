import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BodhiEvent, BodhiEventSchema } from "@bodhi/types";

import { hasGitHook, installGitHooks, uninstallGitHooks } from "./git";

function gitEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		GIT_AUTHOR_EMAIL: "bodhi@example.com",
		GIT_AUTHOR_NAME: "Bodhi Test",
		GIT_COMMITTER_EMAIL: "bodhi@example.com",
		GIT_COMMITTER_NAME: "Bodhi Test",
	};
}

function runGit(repoPath: string, args: string[]): string {
	return execFileSync("git", ["-C", repoPath, ...args], {
		encoding: "utf8",
		env: gitEnv(),
	}).trim();
}

function initGitRepo(repoPath: string): void {
	mkdirSync(repoPath, { recursive: true });
	execFileSync("git", ["init", "-b", "main", repoPath], {
		encoding: "utf8",
		env: gitEnv(),
		stdio: "ignore",
	});
	writeFileSync(join(repoPath, "README.md"), "hello\n", "utf8");
	runGit(repoPath, ["add", "README.md"]);
	runGit(repoPath, ["commit", "-m", "initial"]);
}

function collectSpoolEvents(dataDir: string): BodhiEvent[] {
	if (!existsSync(dataDir)) {
		return [];
	}

	const events: BodhiEvent[] = [];
	for (const entry of readdirSync(dataDir)) {
		if (!entry.startsWith("git-hook-spool.") || !entry.endsWith(".jsonl")) {
			continue;
		}
		const path = join(dataDir, entry);
		for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
			if (!line.trim()) {
				continue;
			}
			events.push(BodhiEventSchema.parse(JSON.parse(line)));
		}
	}
	return events;
}

function hasJsonEncoder(): boolean {
	try {
		execFileSync(
			"/bin/sh",
			["-c", "command -v jq >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1"],
			{
				stdio: "ignore",
			},
		);
		return true;
	} catch {
		return false;
	}
}

describe("git capture workflows", () => {
	test("git hook install preserves existing hook content and is uninstallable", () => {
		const dir = mkdtempSync(join(tmpdir(), "bodhi-git-hook-"));
		const repoPath = join(dir, "repo");
		const dataDir = join(dir, "bodhi-data");

		try {
			initGitRepo(repoPath);
			const hookPath = join(repoPath, ".git", "hooks", "post-commit");
			writeFileSync(hookPath, "#!/bin/sh\necho existing\n", "utf8");

			const first = installGitHooks({
				cwd: repoPath,
				dataDir,
				socketPath: join(dataDir, "bodhi.sock"),
			});
			const second = installGitHooks({
				cwd: repoPath,
				dataDir,
				socketPath: join(dataDir, "bodhi.sock"),
			});
			const installed = readFileSync(hookPath, "utf8");
			const removed = uninstallGitHooks(repoPath);
			const uninstalled = readFileSync(hookPath, "utf8");

			expect(first.changedHooks).toContain("post-commit");
			expect(second.changedHooks).toHaveLength(0);
			expect(hasGitHook(installed)).toBe(true);
			expect(installed).toContain("echo existing");
			expect(removed.changedHooks).toContain("post-commit");
			expect(hasGitHook(uninstalled)).toBe(false);
			expect(uninstalled).toContain("echo existing");
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("commit and checkout hooks emit typed events with shared context", () => {
		if (!hasJsonEncoder()) {
			return;
		}

		const dir = mkdtempSync(join(tmpdir(), "bodhi-git-hook-"));
		const repoPath = join(dir, "repo");
		const dataDir = join(dir, "bodhi-data");

		try {
			initGitRepo(repoPath);
			installGitHooks({
				cwd: repoPath,
				dataDir,
				socketPath: join(dataDir, "bodhi.sock"),
			});

			writeFileSync(join(repoPath, "feature.txt"), "auth\n", "utf8");
			runGit(repoPath, ["add", "feature.txt"]);
			runGit(repoPath, ["commit", "-m", "feat: add auth notes"]);
			runGit(repoPath, ["checkout", "-b", "feature/auth"]);

			const events = collectSpoolEvents(dataDir);
			const commitEvent = events.find((event) => event.type === "git.commit.created");
			const checkoutEvent = events.find((event) => event.type === "git.checkout");

			if (!commitEvent || commitEvent.type !== "git.commit.created") {
				throw new Error("expected git.commit.created");
			}
			if (!checkoutEvent || checkoutEvent.type !== "git.checkout") {
				throw new Error("expected git.checkout");
			}

			expect(commitEvent.metadata.message).toBe("feat: add auth notes");
			expect(commitEvent.metadata.files).toEqual(["feature.txt"]);
			expect(commitEvent.metadata.files_changed).toBe(1);
			expect(commitEvent.metadata.parent_count).toBe(1);
			expect(commitEvent.context?.tool).toBe("git.hook");
			expect(commitEvent.context?.branch).toBe("main");

			expect(checkoutEvent.metadata.checkout_kind).toBe("branch-switch");
			expect(checkoutEvent.metadata.to_branch).toBe("feature/auth");
			expect(checkoutEvent.context?.branch).toBe("feature/auth");
			expect(checkoutEvent.context?.repo_id).toBe(realpathSync(join(repoPath, ".git")));
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("merge and rewrite hooks emit outcome events and rewrite mappings", () => {
		if (!hasJsonEncoder()) {
			return;
		}

		const dir = mkdtempSync(join(tmpdir(), "bodhi-git-hook-"));
		const repoPath = join(dir, "repo");
		const dataDir = join(dir, "bodhi-data");

		try {
			initGitRepo(repoPath);
			installGitHooks({
				cwd: repoPath,
				dataDir,
				socketPath: join(dataDir, "bodhi.sock"),
			});

			runGit(repoPath, ["checkout", "-b", "feature/auth"]);
			writeFileSync(join(repoPath, "feature.txt"), "auth\n", "utf8");
			runGit(repoPath, ["add", "feature.txt"]);
			runGit(repoPath, ["commit", "-m", "feat: branch work"]);
			runGit(repoPath, ["checkout", "main"]);
			runGit(repoPath, ["merge", "--no-ff", "feature/auth", "-m", "merge feature/auth"]);

			writeFileSync(join(repoPath, "feature.txt"), "auth amended\n", "utf8");
			runGit(repoPath, ["add", "feature.txt"]);
			runGit(repoPath, ["commit", "--amend", "-m", "merge feature/auth amended"]);

			const events = collectSpoolEvents(dataDir);
			const mergeEvent = events.find((event) => event.type === "git.merge");
			const rewriteEvent = events.find((event) => event.type === "git.rewrite");

			if (!mergeEvent || mergeEvent.type !== "git.merge") {
				throw new Error("expected git.merge");
			}
			if (!rewriteEvent || rewriteEvent.type !== "git.rewrite") {
				throw new Error("expected git.rewrite");
			}

			expect(mergeEvent.metadata.merge_commit_sha).toBeTruthy();
			expect(mergeEvent.metadata.parent_count).toBeGreaterThanOrEqual(2);
			expect(mergeEvent.metadata.is_squash).toBe(false);

			expect(rewriteEvent.metadata.rewrite_type).toBe("amend");
			expect(rewriteEvent.metadata.rewritten_commit_count).toBe(1);
			expect(rewriteEvent.metadata.mappings).toHaveLength(1);
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	test("installing from a worktree uses the common hooks directory and captures worktree context", () => {
		if (!hasJsonEncoder()) {
			return;
		}

		const dir = mkdtempSync(join(tmpdir(), "bodhi-git-hook-"));
		const repoPath = join(dir, "repo");
		const worktreePath = join(dir, "repo-auth");
		const dataDir = join(dir, "bodhi-data");

		try {
			initGitRepo(repoPath);
			runGit(repoPath, ["worktree", "add", "-b", "feature/auth", worktreePath]);
			const install = installGitHooks({
				cwd: worktreePath,
				dataDir,
				socketPath: join(dataDir, "bodhi.sock"),
			});

			expect(install.hooksDir).toBe(realpathSync(join(repoPath, ".git", "hooks")));

			writeFileSync(join(worktreePath, "worktree.txt"), "worktree\n", "utf8");
			runGit(worktreePath, ["add", "worktree.txt"]);
			runGit(worktreePath, ["commit", "-m", "feat: worktree change"]);

			const events = collectSpoolEvents(dataDir);
			const commitEvent = events.findLast((event) => event.type === "git.commit.created");
			if (!commitEvent || commitEvent.type !== "git.commit.created") {
				throw new Error("expected git.commit.created");
			}

			expect(commitEvent.context?.repo_id).toBe(realpathSync(join(repoPath, ".git")));
			expect(commitEvent.context?.worktree_root).toBe(realpathSync(worktreePath));
			expect(commitEvent.context?.branch).toBe("feature/auth");
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});
});
