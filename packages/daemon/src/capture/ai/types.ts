import { z } from "zod";

export const AssistantCaptureSourceSchema = z.enum(["claude-code", "opencode"]);
export const AssistantInstallScopeSchema = z.enum(["global", "project", "none"]);

export const ClaudeHookEventNameSchema = z.enum(["UserPromptSubmit", "PostToolUse"]);

export const ClaudeHookPayloadSchema = z
	.object({
		cwd: z.string().min(1),
		hook_event_name: ClaudeHookEventNameSchema,
		prompt: z.string().optional(),
		session_id: z.string().min(1),
		tool_input: z.record(z.string(), z.unknown()).optional(),
		tool_name: z.string().optional(),
		tool_response: z.unknown().optional(),
		transcript_path: z.string().optional(),
	})
	.passthrough();

export const OpenCodeCaptureKindSchema = z.enum(["prompt", "tool_call"]);

export const OpenCodeCapturePayloadSchema = z.object({
	cwd: z.string().min(1).optional(),
	description: z.string().optional(),
	event_key: z.string().min(1).optional(),
	kind: OpenCodeCaptureKindSchema,
	prompt: z.string().optional(),
	session_id: z.string().min(1).optional(),
	target: z.string().optional(),
	tool_name: z.string().optional(),
});

export type AssistantCaptureSource = z.infer<typeof AssistantCaptureSourceSchema>;
export type AssistantInstallScope = z.infer<typeof AssistantInstallScopeSchema>;
export type ClaudeHookPayload = z.infer<typeof ClaudeHookPayloadSchema>;
export type OpenCodeCapturePayload = z.infer<typeof OpenCodeCapturePayloadSchema>;
