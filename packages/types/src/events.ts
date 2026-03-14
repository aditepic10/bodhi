import { z } from "zod";

export const GitStateSchema = z.enum([
	"normal",
	"detached",
	"merging",
	"rebasing",
	"cherry-picking",
	"reverting",
	"bisecting",
]);

export const ActivityContextSchema = z
	.object({
		repo_id: z.string().min(1).optional(),
		worktree_root: z.string().min(1).optional(),
		branch: z.string().min(1).optional(),
		head_sha: z.string().min(7).max(40).optional(),
		git_state: GitStateSchema.optional(),
		cwd: z.string().min(1).optional(),
		relative_cwd: z.string().min(1).optional(),
		terminal_session: z.string().min(1).optional(),
		tool: z.string().min(1).optional(),
		thread_id: z.string().min(1).optional(),
	})
	.strict();

export const GitCheckoutKindSchema = z.enum([
	"branch-switch",
	"detached-head",
	"file-checkout",
	"initial-clone",
]);

export const GitRewriteTypeSchema = z.enum(["rebase", "amend"]);

export const GitRewriteMappingSchema = z.object({
	from_hash: z.string(),
	to_hash: z.string(),
});

export const EventTypeSchema = z.enum([
	"shell.command.executed",
	"shell.command.started",
	"git.commit.created",
	"git.checkout",
	"git.merge",
	"git.rewrite",
	"ai.prompt",
	"ai.tool_call",
	"note.created",
]);

export const EventEnvelopeSchema = z.object({
	event_id: z.string().min(1).optional(),
	session_id: z.string().min(1).optional(),
	machine_id: z.string().min(1).optional(),
	schema_version: z.number().int().positive().optional(),
	producer_version: z.string().min(1).optional(),
	created_at: z.number().int().optional(),
	context: ActivityContextSchema.optional(),
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
		parent_count: z.number().int().min(0),
		files_changed: z.number().int().min(0),
		files: z.array(z.string()).optional(),
		insertions: z.number().int().min(0).optional(),
		deletions: z.number().int().min(0).optional(),
	}),
});

export const GitCheckoutSchema = EventEnvelopeSchema.extend({
	type: z.literal("git.checkout"),
	metadata: z.object({
		from_branch: z.string().optional(),
		to_branch: z.string().optional(),
		from_sha: z.string().optional(),
		to_sha: z.string().optional(),
		checkout_kind: GitCheckoutKindSchema,
	}),
});

export const GitMergeSchema = EventEnvelopeSchema.extend({
	type: z.literal("git.merge"),
	metadata: z.object({
		merge_commit_sha: z.string(),
		parent_count: z.number().int().min(0),
		is_squash: z.boolean().optional(),
	}),
});

export const GitRewriteSchema = EventEnvelopeSchema.extend({
	type: z.literal("git.rewrite"),
	metadata: z.object({
		rewrite_type: GitRewriteTypeSchema,
		rewritten_commit_count: z.number().int().min(1),
		mappings: z.array(GitRewriteMappingSchema).optional(),
	}),
});

export const NoteCreatedSchema = EventEnvelopeSchema.extend({
	type: z.literal("note.created"),
	metadata: z.object({
		content: z.string(),
	}),
});

export const AiPromptSchema = EventEnvelopeSchema.extend({
	type: z.literal("ai.prompt"),
	metadata: z.object({
		content: z.string(),
	}),
});

export const AiToolCallSchema = EventEnvelopeSchema.extend({
	type: z.literal("ai.tool_call"),
	metadata: z.object({
		tool_name: z.string(),
		target: z.string().optional(),
		description: z.string().optional(),
	}),
});

export const BodhiEventSchema = z.discriminatedUnion("type", [
	ShellCommandExecutedSchema,
	ShellCommandStartedSchema,
	GitCommitCreatedSchema,
	GitCheckoutSchema,
	GitMergeSchema,
	GitRewriteSchema,
	AiPromptSchema,
	AiToolCallSchema,
	NoteCreatedSchema,
]);

export const IngestEventSchema = z.intersection(
	BodhiEventSchema,
	z.object({
		event_id: z.string().min(1),
	}),
);

export type EventType = z.infer<typeof EventTypeSchema>;
export type ActivityContext = z.infer<typeof ActivityContextSchema>;
export type GitState = z.infer<typeof GitStateSchema>;
export type GitCheckoutKind = z.infer<typeof GitCheckoutKindSchema>;
export type GitRewriteType = z.infer<typeof GitRewriteTypeSchema>;
export type GitRewriteMapping = z.infer<typeof GitRewriteMappingSchema>;
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type ShellCommandExecutedEvent = z.infer<typeof ShellCommandExecutedSchema>;
export type ShellCommandStartedEvent = z.infer<typeof ShellCommandStartedSchema>;
export type GitCommitCreatedEvent = z.infer<typeof GitCommitCreatedSchema>;
export type GitCheckoutEvent = z.infer<typeof GitCheckoutSchema>;
export type GitMergeEvent = z.infer<typeof GitMergeSchema>;
export type GitRewriteEvent = z.infer<typeof GitRewriteSchema>;
export type NoteCreatedEvent = z.infer<typeof NoteCreatedSchema>;
export type AiPromptEvent = z.infer<typeof AiPromptSchema>;
export type AiToolCallEvent = z.infer<typeof AiToolCallSchema>;
export type BodhiEvent = z.infer<typeof BodhiEventSchema>;
export type IngestEvent = z.infer<typeof IngestEventSchema>;
