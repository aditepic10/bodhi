import type { ConversationMessage, Store } from "@bodhi/types";
import {
	type AssistantModelMessage,
	assistantModelMessageSchema,
	type ModelMessage,
	type ToolModelMessage,
	toolModelMessageSchema,
} from "ai";

type ResponseMessage = AssistantModelMessage | ToolModelMessage;

function summarizeAssistantMessage(message: AssistantModelMessage): string {
	if (typeof message.content === "string") {
		return message.content.trim();
	}

	const text = message.content
		.filter((part) => part.type === "text" || part.type === "reasoning")
		.map((part) => part.text)
		.join("\n")
		.trim();
	if (text.length > 0) {
		return text;
	}

	const toolCall = message.content.find((part) => part.type === "tool-call");
	if (toolCall) {
		return `Tool call: ${toolCall.toolName}`;
	}

	const approval = message.content.find((part) => part.type === "tool-approval-request");
	if (approval) {
		return `Tool approval requested: ${approval.toolCallId}`;
	}

	return "";
}

function summarizeToolMessage(message: ToolModelMessage): string {
	const toolResult = message.content.find((part) => part.type === "tool-result");
	if (toolResult) {
		return `Tool result: ${toolResult.toolName}`;
	}

	return "";
}

function parseStructuredContent(entry: ConversationMessage): unknown {
	if (!entry.content_json) {
		return undefined;
	}

	return JSON.parse(entry.content_json);
}

function toModelMessage(entry: ConversationMessage): ModelMessage {
	switch (entry.role) {
		case "system":
			return {
				content: entry.content,
				role: "system",
			};
		case "user":
			return {
				content: [{ text: entry.content, type: "text" }],
				role: "user",
			};
		case "assistant":
			if (entry.content_json) {
				return assistantModelMessageSchema.parse({
					content: parseStructuredContent(entry),
					role: "assistant",
				});
			}
			return {
				content: [{ text: entry.content, type: "text" }],
				role: "assistant",
			};
		case "tool":
			return toolModelMessageSchema.parse({
				content: parseStructuredContent(entry),
				role: "tool",
			});
	}
}

export function conversationToModelMessages(entries: ConversationMessage[]): ModelMessage[] {
	return entries.filter((entry) => entry.status === "complete").map(toModelMessage);
}

export async function persistResponseMessages(
	store: Store,
	sessionId: string,
	messages: ResponseMessage[],
): Promise<void> {
	for (const message of messages) {
		if (message.role === "assistant") {
			const structured = assistantModelMessageSchema.parse(message);
			await store.appendMessage("assistant", summarizeAssistantMessage(structured), sessionId, {
				content_json: JSON.stringify(structured.content),
				status: "complete",
			});
			continue;
		}

		const structured = toolModelMessageSchema.parse(message);
		await store.appendMessage("tool", summarizeToolMessage(structured), sessionId, {
			content_json: JSON.stringify(structured.content),
			status: "complete",
		});
	}
}
