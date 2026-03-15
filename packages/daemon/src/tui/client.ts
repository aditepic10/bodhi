import type { ChatSession, ChatSessionListEntry, ConversationMessage } from "@bodhi/types";
import type { UIMessageChunk } from "ai";
import type { CliRuntime, JsonObject } from "../cli/types";

interface ChatSessionResponse {
	session?: ChatSession;
}

interface ChatSessionListResponse {
	sessions: ChatSessionListEntry[];
}

interface ConversationResponse {
	messages: ConversationMessage[];
}

export async function createChatSession(runtime: CliRuntime): Promise<ChatSession> {
	const config = runtime.loadConfig();
	const response = await runtime.requestJson<ChatSessionResponse, JsonObject>(
		config,
		"/chat/sessions",
		{
			body: { cwd: runtime.cwd() },
			method: "POST",
		},
	);
	if (response.status !== 201 || !response.body.session) {
		throw new Error("failed to create chat session");
	}

	return response.body.session;
}

export async function loadChatSession(
	runtime: CliRuntime,
	sessionId: string,
): Promise<ChatSession> {
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

export async function listChatSessions(runtime: CliRuntime): Promise<ChatSessionListEntry[]> {
	const config = runtime.loadConfig();
	const response = await runtime.requestJson<ChatSessionListResponse>(
		config,
		`/chat/sessions?cwd=${encodeURIComponent(runtime.cwd())}`,
	);
	if (response.status !== 200) {
		throw new Error("failed to list chat sessions");
	}

	return response.body.sessions;
}

export async function loadConversation(
	runtime: CliRuntime,
	sessionId: string,
): Promise<ConversationMessage[]> {
	const config = runtime.loadConfig();
	const response = await runtime.requestJson<ConversationResponse>(
		config,
		`/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
	);
	if (response.status === 404) {
		throw new Error(`chat session not found: ${sessionId}`);
	}
	if (response.status !== 200) {
		throw new Error(`failed to load conversation for ${sessionId}`);
	}

	return response.body.messages;
}

export async function streamChatTurn(
	runtime: CliRuntime,
	request: { message: string; sessionId: string },
	onChunk: (chunk: UIMessageChunk) => void,
	options: { signal?: AbortSignal } = {},
): Promise<void> {
	const config = runtime.loadConfig();
	await runtime.requestSse(
		config,
		"/chat",
		{
			cwd: runtime.cwd(),
			message: request.message,
			session_id: request.sessionId,
		},
		(payload) => {
			onChunk(payload as unknown as UIMessageChunk);
		},
		{ signal: options.signal },
	);
}
