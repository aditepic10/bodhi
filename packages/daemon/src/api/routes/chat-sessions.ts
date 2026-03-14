import type { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";

import { deriveWorkspaceContext } from "../../activity-context";
import type { ApiContext } from "../context";
import { jsonError, parseJsonBody } from "../context";

const CreateChatSessionSchema = z.object({
	cwd: z.string().min(1).optional(),
});

export function registerChatSessionsRoute(app: Hono, api: ApiContext): void {
	app.get("/chat/sessions", async (c) => {
		const cwd = c.req.query("cwd") ?? undefined;
		const limitValue = Number(c.req.query("limit") ?? "20");
		const workspace = deriveWorkspaceContext(cwd);
		const sessions = await api.store.listChatSessions({
			cwd: workspace.cwd,
			limit: Number.isFinite(limitValue) ? limitValue : 20,
			repo_id: workspace.repo_id,
			worktree_root: workspace.worktree_root,
		});

		return c.json({ sessions });
	});

	app.post("/chat/sessions", async (c) => {
		const parsed = await parseJsonBody(c, CreateChatSessionSchema);
		if (!parsed.success) {
			return parsed.response;
		}

		const sessionId = nanoid();
		const workspace = deriveWorkspaceContext(parsed.data.cwd);
		const session = await api.store.upsertChatSession({
			branch: workspace.branch,
			cwd: workspace.cwd,
			repo_id: workspace.repo_id,
			session_id: sessionId,
			worktree_root: workspace.worktree_root,
		});

		return c.json({ session }, 201);
	});

	app.get("/chat/sessions/:sessionId", async (c) => {
		const session = await api.store.getChatSession(c.req.param("sessionId"));
		if (!session) {
			return jsonError(c, 404, "SESSION_NOT_FOUND", "chat session not found");
		}

		return c.json({ session });
	});
}
