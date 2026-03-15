import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BodhiConfig, BodhiConfigSchema } from "@bodhi/types";

import { type CliRuntime, runCli } from "./cli";
import type {
	CliLineReader,
	JsonObject,
	JsonResponse,
	JsonValue,
	RequestOptions,
} from "./cli/types";
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
	const defaultLineReader: CliLineReader = {
		close() {},
		readLine() {
			return Promise.resolve(null);
		},
	};
	return {
		argv: [],
		commandExists() {
			return true;
		},
		createLineReader() {
			return defaultLineReader;
		},
		cwd() {
			return process.cwd();
		},
		isInteractiveTerminal() {
			return true;
		},
		isProcessAlive() {
			return false;
		},
		loadConfig() {
			return config;
		},
		onSignal() {
			return () => {};
		},
		readStdin() {
			return Promise.resolve("");
		},
		async requestJson<TResponse = unknown, _TBody extends JsonValue = JsonObject>() {
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
			} as JsonResponse<TResponse>;
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

function createScriptedLineReader(lines: Array<string | null>): CliLineReader {
	let index = 0;
	return {
		close() {},
		readLine() {
			const value = lines[index] ?? null;
			index += 1;
			return Promise.resolve(value);
		},
	};
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
		expect(readFileSync(join(config.config_dir, "config.toml"), "utf8")).toContain("[agent]");
		expect(readFileSync(join(config.config_dir, "config.toml"), "utf8")).toContain(
			"max_output_tokens = 4096",
		);
		expect(readFileSync(defaultPath(root, ".zshrc"), "utf8")).toContain("# >>> bodhi >>>");
		expect(readFileSync(defaultPath(root, ".bashrc"), "utf8")).toContain("# >>> bodhi >>>");
		expect(readFileSync(join(repoPath, ".git", "hooks", "post-commit"), "utf8")).toContain(
			"# >>> bodhi git >>>",
		);
		expect(readFileSync(join(root, ".claude", "settings.json"), "utf8")).toContain(
			"internal ai-capture claude-code",
		);
		expect(readFileSync(join(root, ".claude", "settings.json"), "utf8")).toContain(
			">/dev/null 2>&1 || true",
		);
		expect(
			readFileSync(join(root, ".config", "opencode", "plugins", "bodhi.ts"), "utf8"),
		).toContain('["bodhi","internal","ai-capture","opencode"]');
		expect(stdout).toContain("Installed zsh hook");
		expect(stdout).toContain("Installed git hooks");
		expect(stdout).toContain("Installed Claude Code integration (global)");
		expect(stdout).toContain("Installed OpenCode integration (global)");
		expect(stdout).toContain("Config:");
		expect(stderr).toContain("uuidgen not found");
		expect(stderr).toContain("jq not found");
	});

	test("init can install assistant integrations at project scope", async () => {
		const root = makeTempDir();
		const repoPath = join(root, "repo");
		process.env.HOME = root;
		const config = makeConfig(root);
		mkdirp(repoPath);
		initGitRepo(repoPath);
		const runtime = createRuntime(config, {
			cwd() {
				return repoPath;
			},
		});

		const exitCode = await runCli(["init", "--assistant-scope", "project"], runtime);
		const { stdout } = runtime._buffers.text();

		expect(exitCode).toBe(0);
		expect(existsSync(join(root, ".claude", "settings.json"))).toBe(false);
		expect(existsSync(join(root, ".config", "opencode", "plugins", "bodhi.ts"))).toBe(false);
		expect(readFileSync(join(repoPath, ".claude", "settings.local.json"), "utf8")).toContain(
			"internal ai-capture claude-code",
		);
		expect(readFileSync(join(repoPath, ".claude", "settings.local.json"), "utf8")).toContain(
			">/dev/null 2>&1 || true",
		);
		expect(readFileSync(join(repoPath, ".opencode", "plugins", "bodhi.ts"), "utf8")).toContain(
			'["bodhi","internal","ai-capture","opencode"]',
		);
		expect(stdout).toContain("Installed Claude Code integration (project)");
		expect(stdout).toContain("Installed OpenCode integration (project)");
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

	test("plain chat starts a new chat session and prints an exact resume command on exit", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const requests: Array<{ method?: string; path: string; body?: JsonObject }> = [];
		const runtime = createRuntime(config, {
			createLineReader() {
				return createScriptedLineReader(["How is retrieval ranked?", null]);
			},
			async requestJson<TResponse = unknown, _TBody extends JsonValue = JsonObject>(
				_config: BodhiConfig,
				path: string,
				options?: RequestOptions<_TBody>,
			) {
				requests.push({
					body:
						options?.body && typeof options.body === "object" && !Array.isArray(options.body)
							? options.body
							: undefined,
					method: options?.method,
					path,
				});
				if (path === "/chat/sessions") {
					return {
						body: {
							session: {
								created_at: 1_710_000_000,
								cwd: root,
								session_id: "chat-session-1",
								updated_at: 1_710_000_000,
							},
						} as TResponse,
						status: 201,
					};
				}
				throw new Error(`unexpected path ${path}`);
			},
			async requestSse(_config, path, body, onEvent) {
				requests.push({ body, method: "POST", path });
				onEvent({ delta: "Here is the latest retrieval state.", id: "msg-1", type: "text-delta" });
				onEvent({ finishReason: "stop", type: "finish" });
			},
		});

		const exitCode = await runCli(["--plain"], runtime);
		const { stdout } = runtime._buffers.text();

		expect(exitCode).toBe(0);
		expect(requests).toEqual([
			{
				body: { cwd: process.cwd() },
				method: "POST",
				path: "/chat/sessions",
			},
			{
				body: {
					cwd: process.cwd(),
					message: "How is retrieval ranked?",
					session_id: "chat-session-1",
				},
				method: "POST",
				path: "/chat",
			},
		]);
		expect(stdout).toContain("Here is the latest retrieval state.");
		expect(stdout).toContain("Resume this session with:");
		expect(stdout).toContain("bodhi --resume chat-session-1");
	});

	test("plain resume loads an exact chat session before entering chat mode", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const requests: string[] = [];
		const runtime = createRuntime(config, {
			createLineReader() {
				return createScriptedLineReader([null]);
			},
			async requestJson<_TResponse = unknown>() {
				throw new Error("requestJson override must include path");
			},
		});
		runtime.requestJson = async <TResponse = unknown>(
			_config: BodhiConfig,
			path: string,
		): Promise<JsonResponse<TResponse>> => {
			requests.push(path);
			if (path === "/chat/sessions/resume-me") {
				return {
					body: {
						session: {
							created_at: 1_710_000_001,
							cwd: root,
							session_id: "resume-me",
							updated_at: 1_710_000_002,
						},
					} as TResponse,
					status: 200,
				};
			}
			throw new Error(`unexpected path ${path}`);
		};

		const exitCode = await runCli(["--plain", "--resume", "resume-me"], runtime);
		const { stdout } = runtime._buffers.text();

		expect(exitCode).toBe(0);
		expect(requests).toEqual(["/chat/sessions/resume-me"]);
		expect(stdout).toContain("bodhi --resume resume-me");
	});

	test("interactive mode errors clearly without a TTY", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const runtime = createRuntime(config, {
			isInteractiveTerminal() {
				return false;
			},
		});

		const exitCode = await runCli([], runtime);
		const { stderr } = runtime._buffers.text();

		expect(exitCode).toBe(1);
		expect(stderr).toContain("interactive terminal");
	});

	test("sessions lists workspace-prioritized chat sessions", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const runtime = createRuntime(config, {
			cwd() {
				return join(root, "repo");
			},
			async requestJson<TResponse = unknown>(_config: BodhiConfig, path: string) {
				expect(path).toBe(`/chat/sessions?cwd=${encodeURIComponent(join(root, "repo"))}`);
				return {
					body: {
						sessions: [
							{
								created_at: 1_710_000_000,
								cwd: join(root, "repo"),
								session_id: "session-local",
								title: "Refine retrieval ranking",
								updated_at: 1_710_000_100,
								workspace_rank: 0,
							},
							{
								created_at: 1_710_000_000,
								cwd: join(root, "other"),
								last_user_message_preview: "Investigate auth retries",
								session_id: "session-other",
								updated_at: 1_710_000_050,
								workspace_rank: 3,
							},
						],
					} as TResponse,
					status: 200,
				};
			},
		});

		const exitCode = await runCli(["sessions"], runtime);
		const { stdout } = runtime._buffers.text();

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Sessions:");
		expect(stdout).toContain("* session-loca");
		expect(stdout).toContain("Refine retrieval ranking");
		expect(stdout).toContain("Investigate auth retries");
	});

	test("recall surfaces daemon disconnects clearly when streaming ends early", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const runtime = createRuntime(config, {
			async requestSse() {
				throw new Error(
					"Bodhi daemon disconnected before finishing streamed response from unix:/tmp/bodhi.sock",
				);
			},
		});

		await expect(runCli(["recall", "what", "happened?"], runtime)).rejects.toThrow(
			"Bodhi daemon disconnected before finishing streamed response",
		);
	});

	test("internal ai capture ingests mapped assistant events", async () => {
		const root = makeTempDir();
		process.env.HOME = root;
		const config = makeConfig(root);
		const requests: Array<{ path: string; body: JsonObject | undefined }> = [];
		const runtime = createRuntime(config, {
			readStdin() {
				return Promise.resolve(
					JSON.stringify({
						cwd: join(root, "repo"),
						hook_event_name: "UserPromptSubmit",
						prompt: "how does retrieval work?",
						session_id: "claude-session-1",
					}),
				);
			},
			async requestJson<TResponse = unknown, _TBody extends JsonValue = JsonObject>(
				_config: BodhiConfig,
				path: string,
				options?: RequestOptions<_TBody>,
			) {
				requests.push({
					body:
						options?.body && typeof options.body === "object" && !Array.isArray(options.body)
							? options.body
							: undefined,
					path,
				});
				return { body: null as TResponse, status: 200 };
			},
		});

		const exitCode = await runCli(["internal", "ai-capture", "claude-code"], runtime);

		expect(exitCode).toBe(0);
		expect(requests).toHaveLength(1);
		expect(requests[0]?.path).toBe("/events");
		expect(requests[0]?.body?.type).toBe("ai.prompt");
	});

	test("internal ai capture spools events when ingest transport fails", async () => {
		const root = makeTempDir();
		process.env.HOME = root;
		const config = makeConfig(root);
		mkdirp(config.data_dir);
		const runtime = createRuntime(config, {
			readStdin() {
				return Promise.resolve(
					JSON.stringify({
						cwd: join(root, "repo"),
						kind: "tool_call",
						session_id: "opencode-session-1",
						target: "README.md",
						tool_name: "Edit",
					}),
				);
			},
			async requestJson<_TResponse = unknown, _TBody extends JsonValue = JsonObject>() {
				throw new Error("socket unavailable");
			},
		});

		const exitCode = await runCli(["internal", "ai-capture", "opencode"], runtime);
		const spoolPath = join(config.data_dir, `spool.${process.pid}.jsonl`);

		expect(exitCode).toBe(0);
		expect(existsSync(spoolPath)).toBe(true);
		expect(readFileSync(spoolPath, "utf8")).toContain('"type":"ai.tool_call"');
	});

	test("init rejects invalid assistant scopes", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		const runtime = createRuntime(config);

		const exitCode = await runCli(["init", "--assistant-scope", "workspace"], runtime);
		const { stderr } = runtime._buffers.text();

		expect(exitCode).toBe(1);
		expect(stderr).toContain("Usage: bodhi init");
	});

	test("start and stop control daemon lifecycle via pid file and health checks", async () => {
		const root = makeTempDir();
		const config = makeConfig(root);
		mkdirp(config.data_dir);
		let aliveChecks = 0;
		const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
		const runtime = createRuntime(config, {
			async requestJson<TResponse = unknown, _TBody extends JsonValue = JsonObject>() {
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
				} as JsonResponse<TResponse>;
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
