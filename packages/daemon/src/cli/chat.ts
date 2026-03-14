import { basename } from "node:path";
import type { ChatSession, ChatSessionListEntry } from "@bodhi/types";

import { formatTimestamp, writeLine } from "./helpers";
import type { CliRuntime, JsonObject } from "./types";

interface ChatSessionResponse {
	session?: ChatSession;
}

interface ChatSessionListResponse {
	sessions: ChatSessionListEntry[];
}

function formatWorkspaceHint(
	session: Pick<ChatSession, "branch" | "cwd" | "worktree_root">,
): string {
	const location = session.worktree_root ?? session.cwd ?? "outside-repo";
	const label = basename(location);
	return session.branch ? `${label} (${session.branch})` : label;
}

function formatSessionLabel(session: ChatSessionListEntry): string {
	return session.title ?? session.last_user_message_preview ?? "(empty session)";
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.message === "request aborted";
}

async function createChatSession(runtime: CliRuntime): Promise<ChatSession> {
	const config = runtime.loadConfig();
	const response = await runtime.requestJson<ChatSessionResponse, JsonObject>(
		config,
		"/chat/sessions",
		{
			body: {
				cwd: runtime.cwd(),
			},
			method: "POST",
		},
	);

	if (response.status !== 201 || !response.body.session) {
		throw new Error("failed to create chat session");
	}

	return response.body.session;
}

async function loadChatSession(runtime: CliRuntime, sessionId: string): Promise<ChatSession> {
	const config = runtime.loadConfig();
	const response = await runtime.requestJson<ChatSessionResponse>(
		config,
		`/chat/sessions/${encodeURIComponent(sessionId)}`,
	);

	if (response.status === 404) {
		throw new Error(`chat session not found: ${sessionId}`);
	}
	if (response.status !== 200 || !response.body.session) {
		throw new Error(`failed to load chat session ${sessionId}`);
	}

	return response.body.session;
}

function printResumeHint(runtime: CliRuntime, sessionId: string): void {
	writeLine(runtime.stdout);
	writeLine(runtime.stdout, "Resume this session with:");
	writeLine(runtime.stdout, `bodhi --resume ${sessionId}`);
}

export async function runInteractiveChat(
	runtime: CliRuntime,
	options: { resumeSessionId?: string } = {},
): Promise<number> {
	const session = options.resumeSessionId
		? await loadChatSession(runtime, options.resumeSessionId)
		: await createChatSession(runtime);
	const config = runtime.loadConfig();
	const lineReader = runtime.createLineReader();
	let shouldExit = false;
	let activeAbort: AbortController | null = null;
	const unsubscribeSigint = runtime.onSignal("SIGINT", () => {
		shouldExit = true;
		if (activeAbort) {
			activeAbort.abort();
			return;
		}

		lineReader.close();
	});

	try {
		while (!shouldExit) {
			const input = await lineReader.readLine("❯ ");
			if (shouldExit || input === null) {
				break;
			}

			const message = input.trim();
			if (!message) {
				continue;
			}

			let wroteText = false;
			const abortController = new AbortController();
			activeAbort = abortController;
			try {
				await runtime.requestSse(
					config,
					"/chat",
					{
						cwd: runtime.cwd(),
						message,
						session_id: session.session_id,
					},
					(payload) => {
						switch (payload.type) {
							case "text-delta":
								wroteText = true;
								runtime.stdout.write(String(payload.delta ?? ""));
								break;
							case "error":
								throw new Error(String(payload.errorText ?? "chat request failed"));
							default:
								break;
						}
					},
					{ signal: abortController.signal },
				);
			} catch (error) {
				if (shouldExit && isAbortError(error)) {
					if (wroteText) {
						writeLine(runtime.stdout);
					}
					break;
				}
				throw error;
			} finally {
				activeAbort = null;
			}

			writeLine(runtime.stdout);
		}
	} finally {
		unsubscribeSigint();
		lineReader.close();
		printResumeHint(runtime, session.session_id);
	}

	return 0;
}

export async function listChatSessions(runtime: CliRuntime): Promise<number> {
	const config = runtime.loadConfig();
	const response = await runtime.requestJson<ChatSessionListResponse>(
		config,
		`/chat/sessions?cwd=${encodeURIComponent(runtime.cwd())}`,
	);

	if (response.status !== 200) {
		throw new Error("failed to list chat sessions");
	}

	if (response.body.sessions.length === 0) {
		writeLine(runtime.stdout, "No chat sessions found.");
		return 0;
	}

	writeLine(runtime.stdout, "Sessions:");
	for (const session of response.body.sessions) {
		const marker = session.workspace_rank < 3 ? "*" : " ";
		writeLine(
			runtime.stdout,
			`${marker} ${session.session_id.slice(0, 12)}  ${formatTimestamp(session.updated_at)}  ${formatWorkspaceHint(session)}  ${formatSessionLabel(session)}`,
		);
	}

	return 0;
}
