import type { ActivityContext, BodhiEvent } from "@bodhi/types";

function basename(value?: string): string {
	if (!value) {
		return "";
	}

	const parts = value.split("/").filter(Boolean);
	return parts.at(-1) ?? value;
}

function joinTokens(...parts: Array<string | undefined>): string {
	return parts
		.map((part) => part?.trim() ?? "")
		.filter((part) => part.length > 0)
		.join(" ");
}

function contextTokens(context?: ActivityContext): string {
	if (!context) {
		return "";
	}

	return joinTokens(
		basename(context.worktree_root ?? context.repo_id),
		context.branch,
		context.relative_cwd,
		context.tool,
		context.thread_id,
	);
}

export function deriveSearchText(event: BodhiEvent): string {
	const context = contextTokens(event.context);

	switch (event.type) {
		case "shell.command.executed":
		case "shell.command.started":
			return joinTokens(event.metadata.command, event.metadata.cwd, context);
		case "git.commit.created":
			return joinTokens(
				event.metadata.message,
				event.metadata.branch,
				event.metadata.files?.join(" "),
				context,
			);
		case "git.checkout":
			return joinTokens(
				"checkout",
				event.metadata.from_branch,
				event.metadata.to_branch,
				event.metadata.from_sha,
				event.metadata.to_sha,
				context,
			);
		case "git.merge":
			return joinTokens(
				"merge",
				event.metadata.branch,
				event.metadata.merged_branch,
				event.metadata.is_squash ? "squash" : undefined,
				context,
			);
		case "git.rewrite":
			return joinTokens(
				event.metadata.rewrite_type,
				String(event.metadata.rewritten_commits),
				context,
			);
		case "ai.prompt":
			return joinTokens(event.metadata.content, context);
		case "ai.tool_call":
			return joinTokens(
				event.metadata.tool_name,
				event.metadata.target,
				event.metadata.description,
				context,
			);
		case "note.created":
			return joinTokens(event.metadata.content, context);
	}
}
