import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import type { BodhiConfig } from "@bodhi/types";

import type {
	JsonObject,
	JsonResponse,
	JsonValue,
	RequestOptions,
	SseRequestOptions,
} from "./types";

function readAuthToken(config: BodhiConfig): string | null {
	const path = join(config.config_dir, "auth-token");
	if (!existsSync(path)) {
		return null;
	}

	return readFileSync(path, "utf8").trim();
}

function endpointLabel(config: BodhiConfig): string {
	return config.transport === "unix"
		? `unix:${config.socket_path}`
		: `http://${config.host}:${config.port}`;
}

export function normalizeRequestError(
	config: BodhiConfig,
	error: unknown,
	phase: "connecting to" | "streaming from",
): Error {
	if (error instanceof Error) {
		const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
		const message = error.message.toLowerCase();
		if (code === "ECONNREFUSED" || code === "ENOENT") {
			return new Error(`could not reach Bodhi daemon at ${endpointLabel(config)}; is it running?`);
		}
		if (code === "ECONNRESET" || code === "EPIPE") {
			return new Error(
				`connection to Bodhi daemon was interrupted while ${phase} ${endpointLabel(config)}`,
			);
		}
		if (message.includes("typo in the url or port")) {
			return new Error(`could not reach Bodhi daemon at ${endpointLabel(config)}; is it running?`);
		}
		return error;
	}

	return new Error(String(error));
}

function requestRaw<TBody extends JsonValue = JsonObject>(
	config: BodhiConfig,
	path: string,
	options: RequestOptions<TBody> = {},
): Promise<{ body: string; status: number }> {
	const method = options.method ?? "GET";
	const payload = options.body ? JSON.stringify(options.body) : undefined;
	const headers: Record<string, string> = {};
	if (payload) {
		headers["content-length"] = Buffer.byteLength(payload).toString();
		headers["content-type"] = "application/json";
	}

	if (options.authenticated !== false) {
		const authToken = readAuthToken(config);
		if (authToken) {
			headers.authorization = `Bearer ${authToken}`;
		}
	}

	return new Promise((resolve, reject) => {
		const request = httpRequest(
			config.transport === "unix"
				? {
						headers,
						method,
						path,
						socketPath: config.socket_path,
					}
				: {
						headers,
						host: config.host,
						method,
						path,
						port: config.port,
					},
			(response) => {
				let body = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("end", () => {
					resolve({
						body,
						status: response.statusCode ?? 0,
					});
				});
			},
		);

		request.on("error", (error) => {
			reject(normalizeRequestError(config, error, "connecting to"));
		});
		if (payload) {
			request.write(payload);
		}
		request.end();
	});
}

export async function requestJson<TResponse = unknown, TBody extends JsonValue = JsonObject>(
	config: BodhiConfig,
	path: string,
	options?: RequestOptions<TBody>,
): Promise<JsonResponse<TResponse>> {
	const response = await requestRaw(config, path, options);
	return {
		body: (response.body.length > 0 ? JSON.parse(response.body) : null) as TResponse,
		status: response.status,
	};
}

export async function requestSse(
	config: BodhiConfig,
	path: string,
	body: JsonObject,
	onEvent: (payload: JsonObject) => void,
	options: SseRequestOptions = {},
): Promise<void> {
	const payload = JSON.stringify(body);
	const headers: Record<string, string> = {
		"content-length": Buffer.byteLength(payload).toString(),
		"content-type": "application/json",
	};
	const authToken = readAuthToken(config);
	if (authToken) {
		headers.authorization = `Bearer ${authToken}`;
	}

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let sawFinish = false;

		const finishResolve = () => {
			if (settled) {
				return;
			}
			settled = true;
			resolve();
		};
		const finishReject = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			reject(error);
		};
		const request = httpRequest(
			config.transport === "unix"
				? {
						headers,
						method: "POST",
						path,
						socketPath: config.socket_path,
					}
				: {
						headers,
						host: config.host,
						method: "POST",
						path,
						port: config.port,
					},
			(response) => {
				if ((response.statusCode ?? 0) !== 200) {
					let bodyText = "";
					response.setEncoding("utf8");
					response.on("data", (chunk) => {
						bodyText += chunk;
					});
					response.on("end", () => {
						finishReject(new Error(`request failed (${response.statusCode ?? 0}): ${bodyText}`));
					});
					return;
				}

				let buffer = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					buffer += chunk;
					let boundary = buffer.indexOf("\n\n");
					while (boundary >= 0) {
						const frame = buffer.slice(0, boundary);
						buffer = buffer.slice(boundary + 2);
						for (const line of frame.split("\n")) {
							if (!line.startsWith("data: ")) {
								continue;
							}

							try {
								const payload = JSON.parse(line.slice(6)) as JsonObject;
								if (payload.type === "finish") {
									sawFinish = true;
								}
								onEvent(payload);
							} catch (error) {
								finishReject(error instanceof Error ? error : new Error(String(error)));
								return;
							}
						}
						boundary = buffer.indexOf("\n\n");
					}
				});
				response.on("aborted", () => {
					finishReject(
						new Error(
							`connection to Bodhi daemon was interrupted while streaming from ${endpointLabel(config)}`,
						),
					);
				});
				response.on("error", (error) => {
					finishReject(normalizeRequestError(config, error, "streaming from"));
				});
				response.on("end", () => {
					if (!sawFinish) {
						finishReject(
							new Error(
								`Bodhi daemon disconnected before finishing streamed response from ${endpointLabel(config)}`,
							),
						);
						return;
					}
					finishResolve();
				});
			},
		);

		request.on("error", (error) => {
			finishReject(normalizeRequestError(config, error, "connecting to"));
		});
		options.signal?.addEventListener(
			"abort",
			() => {
				request.destroy(new Error("request aborted"));
			},
			{ once: true },
		);
		request.write(payload);
		request.end();
	});
}
