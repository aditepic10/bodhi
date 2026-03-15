import { describe, expect, test } from "bun:test";
import { conversationToTranscript, createInitialTuiState, tuiReducer } from "./state";

describe("tui state", () => {
	test("hydrates tool transcript entries from stored conversation rows", () => {
		const transcript = conversationToTranscript([
			{
				content: "Tool result: memory-search",
				content_json: JSON.stringify([
					{
						output: {
							events: [{ type: "ai.prompt" }],
							facts: [{ key: "username", value: "aditpareek" }],
						},
						toolName: "memory-search",
						type: "tool-result",
					},
				]),
				role: "tool",
				status: "complete",
			},
		]);

		expect(transcript[0]).toMatchObject({
			role: "tool",
			summary: "Tool result: memory-search",
			toolName: "memory-search",
		});
	});

	test("streams assistant text and closes it on finish", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { message: "what is 2+2?", type: "append-user-message" });
		state = tuiReducer(state, { type: "start-stream" });
		state = tuiReducer(state, {
			chunk: { delta: "4", id: "assistant-1", type: "text-delta" },
			type: "stream-chunk",
		});
		state = tuiReducer(state, {
			chunk: { finishReason: "stop", type: "finish" },
			type: "stream-chunk",
		});

		expect(state.isStreaming).toBe(false);
		expect(state.transcript.at(-1)).toMatchObject({
			role: "assistant",
			status: "complete",
			text: "4",
		});
	});

	test("hydrate-session replaces optimistic stream state with stored conversation", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { type: "start-stream" });
		state = tuiReducer(state, {
			messages: [{ content: "final answer", role: "assistant", status: "complete" }],
			session: {
				created_at: 1,
				cwd: "/work/bodhi",
				session_id: "session-1",
				updated_at: 1,
			},
			type: "hydrate-session",
		});

		expect(state.isStreaming).toBe(false);
		expect(state.status).toBe("ready");
		expect(state.transcript).toMatchObject([
			{ role: "assistant", status: "complete", text: "final answer" },
		]);
	});

	test("text-delta after tool entries creates continuation instead of updating in-place", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { message: "search my memory", type: "append-user-message" });
		state = tuiReducer(state, { type: "start-stream" });

		// Assistant starts with text
		state = tuiReducer(state, {
			chunk: { delta: "Let me search", id: "msg-1", type: "text-delta" },
			type: "stream-chunk",
		});

		// Tool entries appear
		state = tuiReducer(state, {
			chunk: {
				toolCallId: "call-1",
				toolName: "memory-search",
				type: "tool-input-start",
			},
			type: "stream-chunk",
		});
		state = tuiReducer(state, {
			chunk: {
				output: { events: [], facts: [] },
				toolCallId: "call-1",
				type: "tool-output-available",
			},
			type: "stream-chunk",
		});

		// More text arrives after tools — should NOT update index 1 (original text)
		state = tuiReducer(state, {
			chunk: { delta: "Here are the results", id: "msg-1", type: "text-delta" },
			type: "stream-chunk",
		});

		// Verify ordering: user, assistant text, tool, continuation text
		const roles = state.transcript.map((e) => e.role);
		expect(roles).toEqual(["user", "assistant", "tool", "assistant"]);

		// Original text should be unchanged
		const firstAssistant = state.transcript[1];
		expect(firstAssistant?.role).toBe("assistant");
		if (firstAssistant?.role === "assistant") {
			expect(firstAssistant.text).toBe("Let me search");
		}

		// Continuation should have the new text
		const continuation = state.transcript[3];
		expect(continuation?.role).toBe("assistant");
		if (continuation?.role === "assistant") {
			expect(continuation.text).toBe("Here are the results");
		}
	});

	test("text-delta without intervening tools updates existing entry in-place", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { type: "start-stream" });
		state = tuiReducer(state, {
			chunk: { delta: "Hello", id: "msg-1", type: "text-delta" },
			type: "stream-chunk",
		});
		state = tuiReducer(state, {
			chunk: { delta: " world", id: "msg-1", type: "text-delta" },
			type: "stream-chunk",
		});

		expect(state.transcript).toHaveLength(1);
		const entry = state.transcript[0];
		if (entry?.role === "assistant") {
			expect(entry.text).toBe("Hello world");
		}
	});
});

describe("composer cursor", () => {
	test("inserts text at cursor position", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { value: "hello", type: "append-composer" });
		expect(state.composer).toEqual({ cursor: 5, text: "hello" });

		// Move cursor to beginning and insert
		state = tuiReducer(state, { type: "composer-cursor-home" });
		expect(state.composer.cursor).toBe(0);

		state = tuiReducer(state, { value: "oh ", type: "append-composer" });
		expect(state.composer).toEqual({ cursor: 3, text: "oh hello" });
	});

	test("cursor left and right movement", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { value: "abc", type: "append-composer" });

		state = tuiReducer(state, { type: "composer-cursor-left" });
		expect(state.composer.cursor).toBe(2);

		state = tuiReducer(state, { type: "composer-cursor-right" });
		expect(state.composer.cursor).toBe(3);

		// Shouldn't go past end
		state = tuiReducer(state, { type: "composer-cursor-right" });
		expect(state.composer.cursor).toBe(3);

		// Shouldn't go below 0
		state = tuiReducer(state, { type: "composer-cursor-home" });
		state = tuiReducer(state, { type: "composer-cursor-left" });
		expect(state.composer.cursor).toBe(0);
	});

	test("delete word back removes word before cursor", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { value: "hello world", type: "append-composer" });
		state = tuiReducer(state, { type: "composer-delete-word-back" });
		expect(state.composer).toEqual({ cursor: 6, text: "hello " });

		state = tuiReducer(state, { type: "composer-delete-word-back" });
		expect(state.composer).toEqual({ cursor: 0, text: "" });
	});

	test("kill to end removes text after cursor", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { value: "hello world", type: "append-composer" });
		state = tuiReducer(state, { type: "composer-cursor-home" });
		// Move to position 5
		for (let i = 0; i < 5; i++) {
			state = tuiReducer(state, { type: "composer-cursor-right" });
		}
		state = tuiReducer(state, { type: "composer-kill-to-end" });
		expect(state.composer).toEqual({ cursor: 5, text: "hello" });
	});

	test("backspace at cursor position", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { value: "abc", type: "append-composer" });

		// Move cursor to middle
		state = tuiReducer(state, { type: "composer-cursor-left" });
		state = tuiReducer(state, { type: "trim-composer" });
		expect(state.composer).toEqual({ cursor: 1, text: "ac" });
	});

	test("clear-composer resets cursor to 0", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { value: "hello", type: "append-composer" });
		state = tuiReducer(state, { type: "clear-composer" });
		expect(state.composer).toEqual({ cursor: 0, text: "" });
	});
});

describe("transcript scrolling", () => {
	test("scroll-transcript changes offset", () => {
		let state = createInitialTuiState();
		// Add several entries
		for (let i = 0; i < 20; i++) {
			state = tuiReducer(state, { message: `msg ${i}`, type: "append-user-message" });
		}

		state = tuiReducer(state, { delta: -5, type: "scroll-transcript" });
		expect(state.scrollOffset).toBe(0); // Can't go below 0

		state = tuiReducer(state, { delta: 5, type: "scroll-transcript" });
		expect(state.scrollOffset).toBe(5);

		state = tuiReducer(state, { type: "scroll-to-bottom" });
		expect(state.scrollOffset).toBe(0);
	});

	test("sending a message resets scroll to bottom", () => {
		let state = createInitialTuiState();
		for (let i = 0; i < 10; i++) {
			state = tuiReducer(state, { message: `msg ${i}`, type: "append-user-message" });
		}

		state = tuiReducer(state, { delta: 5, type: "scroll-transcript" });
		expect(state.scrollOffset).toBe(5);

		state = tuiReducer(state, { message: "new msg", type: "append-user-message" });
		expect(state.scrollOffset).toBe(0);
	});

	test("starting stream resets scroll to bottom", () => {
		let state = createInitialTuiState();
		state = tuiReducer(state, { delta: 5, type: "scroll-transcript" });
		state = tuiReducer(state, { type: "start-stream" });
		expect(state.scrollOffset).toBe(0);
	});
});
