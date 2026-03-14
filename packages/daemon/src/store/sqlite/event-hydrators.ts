import {
	type ActivityContext,
	EventSourceSchema,
	GitCheckoutKindSchema,
	GitRewriteSchema,
	type StoredEvent,
} from "@bodhi/types";

import type { EventEnvelopeRow, StoredEventByType, StoredEventParts } from "./types";

type SharedFields = Omit<StoredEvent, "metadata" | "type">;

function sharedFields(envelope: EventEnvelopeRow, context?: ActivityContext): SharedFields {
	return {
		context,
		created_at: envelope.created_at,
		event_id: envelope.event_id,
		id: envelope.id,
		machine_id: envelope.machine_id ?? undefined,
		processed_at: envelope.processed_at ?? undefined,
		producer_version: envelope.producer_version ?? undefined,
		schema_version: envelope.schema_version,
		session_id: envelope.session_id ?? undefined,
		source: EventSourceSchema.parse(envelope.source),
		started_at: envelope.started_at ?? undefined,
	};
}

export function hydrateShellCommandExecuted(
	parts: StoredEventParts<"shell.command.executed">,
): StoredEventByType<"shell.command.executed"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "shell.command.executed",
		metadata: {
			command: parts.payload.command,
			cwd: parts.context?.cwd ?? "",
			duration_ms: parts.payload.duration_ms ?? 0,
			exit_code: parts.payload.exit_code ?? 0,
		},
	};
}

export function hydrateShellCommandStarted(
	parts: StoredEventParts<"shell.command.started">,
): StoredEventByType<"shell.command.started"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "shell.command.started",
		metadata: {
			command: parts.payload.command,
			cwd: parts.context?.cwd ?? "",
		},
	};
}

export function hydrateGitCommitCreated(
	parts: StoredEventParts<"git.commit.created">,
): StoredEventByType<"git.commit.created"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "git.commit.created",
		metadata: {
			deletions: parts.payload.deletions ?? undefined,
			files: parts.commitFiles,
			files_changed: parts.payload.files_changed,
			hash: parts.payload.hash,
			insertions: parts.payload.insertions ?? undefined,
			message: parts.payload.message,
			parent_count: parts.payload.parent_count,
		},
	};
}

export function hydrateGitCheckout(
	parts: StoredEventParts<"git.checkout">,
): StoredEventByType<"git.checkout"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "git.checkout",
		metadata: {
			checkout_kind: GitCheckoutKindSchema.parse(parts.payload.checkout_kind),
			from_branch: parts.payload.from_branch ?? undefined,
			from_sha: parts.payload.from_sha ?? undefined,
			to_branch: parts.payload.to_branch ?? undefined,
			to_sha: parts.payload.to_sha ?? undefined,
		},
	};
}

export function hydrateGitMerge(
	parts: StoredEventParts<"git.merge">,
): StoredEventByType<"git.merge"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "git.merge",
		metadata: {
			is_squash: Boolean(parts.payload.is_squash),
			merge_commit_sha: parts.payload.merge_commit_sha,
			parent_count: parts.payload.parent_count,
		},
	};
}

export function hydrateGitRewrite(
	parts: StoredEventParts<"git.rewrite">,
): StoredEventByType<"git.rewrite"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "git.rewrite",
		metadata: {
			mappings: parts.rewriteMappings,
			rewrite_type: GitRewriteSchema.shape.metadata.shape.rewrite_type.parse(
				parts.payload.rewrite_type,
			),
			rewritten_commit_count: parts.payload.rewritten_commit_count,
		},
	};
}

export function hydrateAiPrompt(
	parts: StoredEventParts<"ai.prompt">,
): StoredEventByType<"ai.prompt"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "ai.prompt",
		metadata: {
			content: parts.payload.content,
		},
	};
}

export function hydrateAiToolCall(
	parts: StoredEventParts<"ai.tool_call">,
): StoredEventByType<"ai.tool_call"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "ai.tool_call",
		metadata: {
			description: parts.payload.description ?? undefined,
			target: parts.payload.target ?? undefined,
			tool_name: parts.payload.tool_name,
		},
	};
}

export function hydrateNoteCreated(
	parts: StoredEventParts<"note.created">,
): StoredEventByType<"note.created"> {
	return {
		...sharedFields(parts.envelope, parts.context),
		type: "note.created",
		metadata: {
			content: parts.payload.content,
		},
	};
}
