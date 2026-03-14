import { rmSync } from "node:fs";
import type { BodhiConfig } from "@bodhi/types";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";

import type { EventBus } from "../bus";
import type { Logger } from "../logger";
import type { PipelineLike, SqliteStore } from "../store/sqlite";
import type { ApiContext, ApiContextOverrides } from "./context";
import { createApiContext, jsonError, MAX_JSON_BYTES } from "./context";
import { registerAgentRoute } from "./routes/agent";
import { registerFactsRoute } from "./routes/facts";
import { registerHealthRoute } from "./routes/health";
import { registerIngestRoute } from "./routes/ingest";
import { registerQueryRoute } from "./routes/query";
import { registerStreamRoute } from "./routes/stream";

interface ServerDependencies {
	config: BodhiConfig;
	store: SqliteStore;
	pipeline: PipelineLike;
	bus: EventBus;
	log: Logger;
	authToken: string;
}

export interface RunningApiServer {
	api: ApiContext;
	app: Hono;
	stop(): Promise<void>;
	url: string;
}

interface RateWindow {
	limit: number;
	windowMs: number;
}

export type ServeConfig =
	| {
			idleTimeout: number;
			transport: "tcp";
			host: string;
			port: number;
	  }
	| {
			idleTimeout: number;
			transport: "unix";
			socketPath: string;
	  };

type HttpServeHandler = (
	this: Bun.Server<undefined>,
	request: Request,
	server: Bun.Server<undefined>,
) => Response | Promise<Response>;

type TcpHttpServeOptions = Bun.Serve.HostnamePortServeOptions<undefined> & {
	fetch: HttpServeHandler;
	routes?: never;
};

type UnixHttpServeOptions = Bun.Serve.UnixServeOptions<undefined> & {
	fetch: HttpServeHandler;
	routes?: never;
};

class SlidingWindowLimiter {
	private readonly hits = new Map<string, number[]>();

	constructor(private readonly window: RateWindow) {}

	check(key: string, now = Date.now()): boolean {
		const threshold = now - this.window.windowMs;
		const retained = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > threshold);
		if (retained.length >= this.window.limit) {
			this.hits.set(key, retained);
			return false;
		}

		retained.push(now);
		this.hits.set(key, retained);
		return true;
	}
}

function createRateLimitMiddleware(
	code: string,
	windows: readonly RateWindow[],
): MiddlewareHandler {
	const limiters = windows.map((window) => new SlidingWindowLimiter(window));

	return async (c: Context, next) => {
		const key = `${c.req.method}:${c.req.path}`;
		const allowed = limiters.every((limiter) => limiter.check(key));
		if (!allowed) {
			return jsonError(c, 429, code, "rate limit exceeded");
		}

		await next();
	};
}

export function createApiApp(
	dependencies: ServerDependencies,
	overrides: ApiContextOverrides = {},
): { app: Hono; api: ApiContext } {
	const api = createApiContext(dependencies, overrides);
	const app = new Hono();

	app.onError((error, c) => {
		api.log.error("uncaught api error", {
			error: error instanceof Error ? error.message : String(error),
		});
		return jsonError(c, 500, "INTERNAL_ERROR", "internal server error");
	});

	app.use("*", async (c, next) => {
		const startedAt = Date.now();
		await next();
		api.log.info("http request completed", {
			method: c.req.method,
			path: c.req.path,
			status: c.res.status,
			duration_ms: Date.now() - startedAt,
		});
	});

	app.use("*", async (c, next) => {
		if (api.config.transport !== "tcp") {
			return next();
		}

		if (c.req.method === "GET" && c.req.path === "/health") {
			return next();
		}

		const authorization = c.req.header("authorization");
		if (authorization !== `Bearer ${api.authToken}`) {
			return jsonError(c, 401, "UNAUTHORIZED", "missing or invalid bearer token");
		}

		await next();
	});

	app.use("*", async (c, next) => {
		const contentLength = Number(c.req.header("content-length") ?? "0");
		if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
			return jsonError(c, 413, "BODY_TOO_LARGE", "request body exceeds 64KB");
		}

		await next();
	});

	app.use(
		"/agent",
		createRateLimitMiddleware("RATE_LIMITED", [
			{ limit: api.config.rate_limits.agent_per_minute, windowMs: 60_000 },
			{ limit: api.config.rate_limits.agent_per_hour, windowMs: 60 * 60_000 },
		]),
	);
	app.use(
		"/events",
		createRateLimitMiddleware("RATE_LIMITED", [
			{ limit: api.config.rate_limits.events_per_minute, windowMs: 60_000 },
		]),
	);
	app.use(
		"/facts",
		createRateLimitMiddleware("RATE_LIMITED", [
			{ limit: api.config.rate_limits.facts_per_minute, windowMs: 60_000 },
		]),
	);

	registerHealthRoute(app, api);
	registerIngestRoute(app, api);
	registerFactsRoute(app, api);
	registerQueryRoute(app, api);
	registerAgentRoute(app, api);
	registerStreamRoute(app, api);

	return { app, api };
}

export function createServeConfig(config: BodhiConfig): ServeConfig {
	return config.transport === "unix"
		? {
				idleTimeout: 0,
				socketPath: config.socket_path,
				transport: "unix",
			}
		: {
				host: config.host,
				idleTimeout: 0,
				port: config.port,
				transport: "tcp",
			};
}

export function startApiServer(
	dependencies: ServerDependencies,
	overrides: ApiContextOverrides = {},
): RunningApiServer {
	const { app, api } = createApiApp(dependencies, overrides);
	const serveConfig = createServeConfig(api.config);
	let server: ReturnType<typeof Bun.serve>;
	if (serveConfig.transport === "unix") {
		const unixServeOptions: UnixHttpServeOptions = {
			fetch(request) {
				return app.fetch(request);
			},
			unix: serveConfig.socketPath,
		};
		// bun-types omits idleTimeout on UnixServeOptions, but Bun supports it at runtime.
		Reflect.set(unixServeOptions, "idleTimeout", serveConfig.idleTimeout);
		server = Bun.serve(unixServeOptions);
	} else {
		const tcpServeOptions: TcpHttpServeOptions = {
			fetch(request) {
				return app.fetch(request);
			},
			hostname: serveConfig.host,
			idleTimeout: serveConfig.idleTimeout,
			port: serveConfig.port,
		};
		server = Bun.serve(tcpServeOptions);
	}

	const url =
		api.config.transport === "unix"
			? `unix:${api.config.socket_path}`
			: `http://${api.config.host}:${api.config.port}`;
	api.log.info("api server listening", { transport: api.config.transport, url });

	return {
		api,
		app,
		async stop() {
			await server.stop(true);
			if (api.config.transport === "unix") {
				rmSync(api.config.socket_path, { force: true });
			}
		},
		url,
	};
}
