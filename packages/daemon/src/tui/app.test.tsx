import { describe, expect, test } from "bun:test";
import { type BodhiConfig, BodhiConfigSchema } from "@bodhi/types";
import { testRender } from "@opentui/react/test-utils";
import type { CliRuntime, JsonObject, JsonResponse, JsonValue } from "../cli/types";
import { BodhiTuiApp } from "./app";
import { TuiConfigSchema } from "./config";
import { resolveTuiTheme } from "./theme";

function createRuntime(): CliRuntime {
	const config = BodhiConfigSchema.parse({
		config_dir: "/tmp/bodhi-tui-test",
		data_dir: "/tmp/bodhi-tui-test",
		socket_path: "/tmp/bodhi-tui-test/bodhi.sock",
	});

	return {
		argv: [],
		commandExists() {
			return true;
		},
		createLineReader() {
			throw new Error("line reader not used in tui tests");
		},
		cwd() {
			return "/work/bodhi";
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
		async requestJson<TResponse = unknown, _TBody extends JsonValue = JsonObject>(
			_config: BodhiConfig,
			path: string,
		): Promise<JsonResponse<TResponse>> {
			if (path === "/chat/sessions/resume-me") {
				return {
					body: {
						session: {
							created_at: 1_710_000_001,
							cwd: "/work/bodhi",
							session_id: "resume-me",
							updated_at: 1_710_000_002,
							worktree_root: "/work/bodhi",
						},
					} as TResponse,
					status: 200,
				};
			}

			if (path === "/chat/sessions/resume-me/messages") {
				return {
					body: {
						messages: [
							{ content: "what is 2+2?", role: "user", status: "complete" },
							{ content: "4", role: "assistant", status: "complete" },
						],
					} as TResponse,
					status: 200,
				};
			}

			if (path === `/chat/sessions?cwd=${encodeURIComponent("/work/bodhi")}`) {
				return {
					body: {
						sessions: [
							{
								created_at: 1_710_000_001,
								cwd: "/work/bodhi",
								session_id: "resume-me",
								title: "Arithmetic session",
								updated_at: 1_710_000_002,
								workspace_rank: 0,
							},
						],
					} as TResponse,
					status: 200,
				};
			}

			throw new Error(`unexpected path ${path}`);
		},
		async requestSse() {
			throw new Error("streaming not used in this test");
		},
		sleep(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		},
		signalProcess() {},
		spawnDaemon() {
			return {
				pid: 1,
				unref() {},
			};
		},
		stderr: { write() {} },
		stdout: { write() {} },
	};
}

describe("tui app", () => {
	test("hydrates an existing session transcript into the shell", async () => {
		const runtime = createRuntime();
		const lastSessionIds: string[] = [];
		const config = TuiConfigSchema.parse({});
		const theme = resolveTuiTheme(config);

		const { renderer, renderOnce, captureCharFrame } = await testRender(
			<BodhiTuiApp
				config={config}
				onSessionChange={(sessionId: string) => {
					lastSessionIds.push(sessionId);
				}}
				resumeSessionId="resume-me"
				runtime={runtime}
				theme={theme}
			/>,
			{ width: 80, height: 24 },
		);

		await runtime.sleep(25);
		await renderOnce();
		const output = captureCharFrame();

		expect(output).toContain("bodhi");
		expect(output).toContain("what is 2+2?");
		expect(output).toContain("4");
		expect(lastSessionIds).toEqual(["resume-me"]);
		renderer.destroy();
	});
});
