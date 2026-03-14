import { z } from "zod";

export const EventTypeSchema = z.enum([
	"shell.command.executed",
	"shell.command.started",
	"git.commit.created",
	"note.created",
	"fact.extracted",
	"conversation.message",
]);

export const EventEnvelopeSchema = z.object({
	event_id: z.string().min(1).optional(),
	session_id: z.string().min(1).optional(),
	machine_id: z.string().min(1).optional(),
	schema_version: z.number().int().positive().optional(),
	producer_version: z.string().min(1).optional(),
	created_at: z.number().int().optional(),
});

export const ShellCommandExecutedSchema = EventEnvelopeSchema.extend({
	type: z.literal("shell.command.executed"),
	metadata: z.object({
		command: z.string(),
		exit_code: z.number().int(),
		duration_ms: z.number().int().min(0),
		cwd: z.string(),
		hostname: z.string().optional(),
	}),
});

export const ShellCommandStartedSchema = EventEnvelopeSchema.extend({
	type: z.literal("shell.command.started"),
	metadata: z.object({
		command: z.string(),
		cwd: z.string(),
		hostname: z.string().optional(),
	}),
});

export const GitCommitCreatedSchema = EventEnvelopeSchema.extend({
	type: z.literal("git.commit.created"),
	metadata: z.object({
		hash: z.string(),
		message: z.string(),
		branch: z.string(),
		files_changed: z.number().int().min(0),
	}),
});

export const NoteCreatedSchema = EventEnvelopeSchema.extend({
	type: z.literal("note.created"),
	metadata: z.object({
		content: z.string(),
		tags: z.array(z.string()).optional(),
	}),
});

export const FactExtractedEventSchema = EventEnvelopeSchema.extend({
	type: z.literal("fact.extracted"),
	metadata: z.object({
		key: z.string(),
		value: z.string(),
		source_event_id: z.string(),
		confidence: z.number().min(0).max(1),
	}),
});

export const ConversationMessageSchema = EventEnvelopeSchema.extend({
	type: z.literal("conversation.message"),
	metadata: z.object({
		role: z.enum(["user", "assistant", "system"]),
		content: z.string(),
		session_id: z.string(),
	}),
});

export const BodhiEventSchema = z.discriminatedUnion("type", [
	ShellCommandExecutedSchema,
	ShellCommandStartedSchema,
	GitCommitCreatedSchema,
	NoteCreatedSchema,
	FactExtractedEventSchema,
	ConversationMessageSchema,
]);

export const IngestEventSchema = z.intersection(
	BodhiEventSchema,
	z.object({
		event_id: z.string().min(1),
	}),
);

export type EventType = z.infer<typeof EventTypeSchema>;
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type ShellCommandExecutedEvent = z.infer<typeof ShellCommandExecutedSchema>;
export type ShellCommandStartedEvent = z.infer<typeof ShellCommandStartedSchema>;
export type GitCommitCreatedEvent = z.infer<typeof GitCommitCreatedSchema>;
export type NoteCreatedEvent = z.infer<typeof NoteCreatedSchema>;
export type FactExtractedEvent = z.infer<typeof FactExtractedEventSchema>;
export type ConversationMessageEvent = z.infer<typeof ConversationMessageSchema>;
export type BodhiEvent = z.infer<typeof BodhiEventSchema>;
export type IngestEvent = z.infer<typeof IngestEventSchema>;
