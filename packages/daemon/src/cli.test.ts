import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BodhiConfig, BodhiConfigSchema } from "@bodhi/types";

import { type CliRuntime, runCli } from "./cli";
import { applyPragmas, createStore, ensureCoreSchema, setupFts } from "./store/sqlite";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "bodhi-cli-"));
	tempDirs.push(dir);
	return dir;
}

function makeConfig(root: string): BodhiConfig {
	return BodhiConfigSchema.parse({
		config_dir: join(root, ".config", "bodhi"),
		data_dir: join(root, ".local", "share", "bodhi"),
		socket_path: join(root, ".local", "share", "bodhi", "bodhi.sock"),
	});
}

function createBuffers() {
	let stdout = "";
	let stderr = "";
	return {
		stderr: {
			write(chunk: string) {
				stderr += chunk;
			},
		},
		stdout: {
			write(chunk: string) {
				stdout += chunk;
			},
		},
		text() {
			return { stderr, stdout };
		},
	};
}

function createRuntime(
	config: BodhiConfig,
	overrides: Partial<CliRuntime> = {},
): CliRuntime & { _buffers: ReturnType<typeof createBuffers> } {
	const buffers = createBuffers();
	return {
		argv: [],
		commandExists() {
			return true;
		},
		cwd() {
			return process.cwd();
		},
		isProcessAlive() {
			return false;
		},
		loadConfig() {
			return config;
		},
		async requestJson() {
			return {
				body: {
					components: {
						circuit_breaker: "closed",
						disk_free_mb: 2048,
						intel: "healthy",
						queue: { depth: 0, max: 1000 },
						spool_files: 0,
						store: "healthy",
					},
					ok: true,
					uptime: 120,
				},
				status: 200,
			};
		},
		async requestSse(_config, _path, _body, onEvent) {
			onEvent({ text: "hello ", type: "text-delta" });
			onEvent({ text: "world", type: "text-delta" });
			onEvent({ session_id: "sess-1", type: "finish" });
		},
		sleep() {
			return Promise.resolve();
		},
		signalProcess() {},
		spawnDaemon() {
			return {
				pid: 4242,
				startupLogPath: undefined,
				unref() {},
			};
		},
		stderr: buffers.stderr,
		stdout: buffers.stdout,
		...overrides,
		_buffers: buffers,
	} as CliRuntime & { _buffers: ReturnType<typeof createBuffers> };
}

function initGitRepo(repoPath: string): void {
	execFileSync("git", ["init", "-b", "main", repoPath], {
		env: {
			...process.env,
			GIT_AUTHOR_EMAIL: "bodhi@example.com",
			GIT_AUTHOR_NAME: "Bodhi Test",
			GIT_COMMITTER_EMAIL: "bodhi@example.com",
			GIT_COMMITTER_NAME: "Bodhi Test",
		},
		stdio: "ignore",
	});
}

afterEach(() => {
	process.env.HOME = originalHome;
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("cli workflows", () => {
	test("init writes config and installs shell hooks", async () => {
		const root = makeTempDir();
		const repoPath = join(root, "repo");
		process.env.HOME = root;
		const config = makeConfig(root);
		mkdirp(repoPath);
		initGitRepo(repoPath);
		const runtime = createRuntime(config, {
			commandExists(command: string) {
				return command === "python3";
			},
			cwd() {
				return repoPath;
			},
		});

		const exitCode = await runCli(["init"], runtime);
		const { stderr, stdout } = runtime._buffers.text();

		expect(exitCode).toBe(0);
		expect(existsSync(join(config.config_dir, "config.toml"))).toBe(true);
		expect(readFileSync(defaultPath(root, ".zshrc"), "utf8")).toContain("# >>> bodhi >>>");
		expect(readFileSync(defaultPath(root, ".bashrc"), "utf8")).toContain("# >>> bodhi >>>");
		expect(readFileSync(join(repoPath, ".git", "hooks", "post-commit"), "utf8")).toContain(
			"# >>> bodhi git >>>",
		);
		expect(stdout).toContain("Installed zsh hook");
		expect(stdout).toContain("Installed git hooks");
		expect(stdout).toContain("Config:");
		expect(stderr).toContain("uuidgen not found");
		expect(stderr).toContain("jq not found");
	});

	test("status reads daemon health and local sqlite metrics", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const dbPath = join(config.data_dir, "bodhi.db");
		mkdirp(config.config_dir);
		mkdirp(config.data_dir);

		const db = new Database(dbPath);
		applyPragmas(db);
		ensureCoreSchema(db);
		setupFts(db);
		const store = createStore(db, { autoApprove: false });
		await store.appendEvent(
			{
				event_id: "evt-status-1",
				metadata: {
					command: "git status",
					cwd: root,
					duration_ms: 12,
					exit_code: 0,
				},
				type: "shell.command.executed",
			},
			"shell",
		);
		await store.insertFact({
			confidence: 0.9,
			created_by: "intel",
			extraction_meta: undefined,
			key: "current_project",
			schema_version: 1,
			source_event_id: undefined,
			status: "pending",
			supersedes_fact_id: undefined,
			valid_from: undefined,
			valid_to: undefined,
			value: "bodhi",
		});
		store.close();

		const runtime = createRuntime(config);
		const exitCode = await runCli(["status"], runtime);
		const { stdout } = runtime._buffers.text();

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Status: running");
		expect(stdout).toContain("Event count: 1");
		expect(stdout).toContain("Pending facts: 1");
		expect(stdout).toContain("DB size:");
		expect(stdout).toContain("Last event:");
	});

	test("recall streams text deltas to stdout", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const runtime = createRuntime(config);

		const exitCode = await runCli(["recall", "what", "did", "I", "do?"], runtime);
		const { stdout } = runtime._buffers.text();

		expect(exitCode).toBe(0);
		expect(stdout).toBe("hello world\n");
	});

	test("start and stop control daemon lifecycle via pid file and health checks", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		mkdirp(config.data_dir);
		let aliveChecks = 0;
		const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
		const runtime = createRuntime(config, {
			async requestJson() {
				return {
					body: {
						components: {
							circuit_breaker: "closed",
							disk_free_mb: 2048,
							intel: "healthy",
							queue: { depth: 0, max: 1000 },
							spool_files: 0,
							store: "healthy",
						},
						ok: true,
						uptime: 1,
					},
					status: 200,
				};
			},
			isProcessAlive(pid: number) {
				if (pid !== 4242) {
					return false;
				}
				aliveChecks += 1;
				return aliveChecks < 2;
			},
			signalProcess(pid: number, signal: NodeJS.Signals) {
				signals.push({ pid, signal });
			},
		});

		const startExit = await runCli(["start"], runtime);
		writeFileSync(join(config.data_dir, "bodhi.pid"), "4242\n");
		const stopExit = await runCli(["stop"], runtime);
		const { stdout } = runtime._buffers.text();

		expect(startExit).toBe(0);
		expect(stopExit).toBe(0);
		expect(signals).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
		expect(stdout).toContain("Bodhi started (pid 4242)");
		expect(stdout).toContain("Bodhi stopped (pid 4242)");
	});

	test("start surfaces daemon startup log when health never comes up", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		mkdirp(config.data_dir);
		const startupLogPath = join(config.data_dir, "daemon-startup.log");
		writeFileSync(
			startupLogPath,
			"prepareQuery failed\nSQLITE_ERROR: table events already exists\n",
		);

		const runtime = createRuntime(config, {
			async requestJson() {
				throw new Error("connect ENOENT");
			},
			spawnDaemon() {
				return {
					pid: 4242,
					startupLogPath,
					unref() {},
				};
			},
		});

		await expect(runCli(["start"], runtime)).rejects.toThrow(
			"SQLITE_ERROR: table events already exists",
		);
	});
});

function mkdirp(path: string): void {
	mkdirSync(path, { recursive: true });
}

function defaultPath(root: string, file: string): string {
	return join(root, file);
}
