import { z } from "zod";

import { ActivityContextSchema, BodhiEventSchema } from "./events";

export const EventSourceSchema = z.enum(["shell", "git", "manual", "api", "ai"]);
export const FactCreatedBySchema = z.enum(["intel", "agent", "user", "api"]);
export const FactStatusSchema = z.enum(["active", "pending", "rejected"]);
export const ConversationRoleSchema = z.enum(["user", "assistant", "system"]);

export const StoredEventSchema = z.intersection(
	BodhiEventSchema,
	z.object({
		id: z.string(),
		event_id: z.string(),
		source: EventSourceSchema,
		session_id: z.string().optional(),
		machine_id: z.string().optional(),
		schema_version: z.number().int().positive(),
		producer_version: z.string().optional(),
		created_at: z.number().int(),
		processed_at: z.number().int().optional(),
		started_at: z.number().int().optional(),
		context: ActivityContextSchema.optional(),
	}),
);

export const FactSchema = z.object({
	id: z.string(),
	key: z.string(),
	value: z.string(),
	created_by: FactCreatedBySchema,
	source_event_id: z.string().optional(),
	status: FactStatusSchema,
	confidence: z.number().min(0).max(1),
	schema_version: z.number().int().positive().default(1),
	supersedes_fact_id: z.string().optional(),
	extraction_meta: z.string().optional(),
	valid_from: z.number().int().optional(),
	valid_to: z.number().int().optional(),
	created_at: z.number().int(),
	updated_at: z.number().int(),
});

export const FactLinkSchema = z.object({
	id: z.string(),
	fact_id_from: z.string(),
	fact_id_to: z.string(),
	relationship_type: z.string(),
	created_at: z.number().int(),
});

export const ConversationTurnSchema = z.object({
	role: ConversationRoleSchema,
	content: z.string(),
});

export const ConversationEntrySchema = ConversationTurnSchema.extend({
	id: z.string(),
	session_id: z.string(),
	created_at: z.number().int(),
});

export const ChatSessionSchema = z.object({
	session_id: z.string(),
	created_at: z.number().int(),
	updated_at: z.number().int(),
	repo_id: z.string().optional(),
	worktree_root: z.string().optional(),
	cwd: z.string().optional(),
	branch: z.string().optional(),
	title: z.string().optional(),
	last_user_message_preview: z.string().optional(),
});

export const ChatSessionListEntrySchema = ChatSessionSchema.extend({
	workspace_rank: z.number().int().min(0),
});

export type EventSource = z.infer<typeof EventSourceSchema>;
export type FactCreatedBy = z.infer<typeof FactCreatedBySchema>;
export type FactStatus = z.infer<typeof FactStatusSchema>;
export type ConversationRole = z.infer<typeof ConversationRoleSchema>;
export type StoredEvent = z.infer<typeof StoredEventSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type FactLink = z.infer<typeof FactLinkSchema>;
export type ConversationMessage = z.infer<typeof ConversationTurnSchema>;
export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type ChatSessionListEntry = z.infer<typeof ChatSessionListEntrySchema>;
