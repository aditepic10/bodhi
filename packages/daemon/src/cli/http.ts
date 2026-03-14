import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import type { BodhiConfig } from "@bodhi/types";

import type { JsonResponse, RequestOptions } from "./types";

function readAuthToken(config: BodhiConfig): string | null {
	const path = join(config.config_dir, "auth-token");
	if (!existsSync(path)) {
		return null;
	}

	return readFileSync(path, "utf8").trim();
}

function requestRaw(
	config: BodhiConfig,
	path: string,
	options: RequestOptions = {},
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

		request.on("error", reject);
		if (payload) {
			request.write(payload);
		}
		request.end();
	});
}

export async function requestJson(
	config: BodhiConfig,
	path: string,
	options?: RequestOptions,
): Promise<JsonResponse> {
	const response = await requestRaw(config, path, options);
	return {
		body: response.body.length > 0 ? JSON.parse(response.body) : null,
		status: response.status,
	};
}

export async function requestSse(
	config: BodhiConfig,
	path: string,
	body: Record<string, unknown>,
	onEvent: (payload: Record<string, unknown>) => void,
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
						reject(new Error(`request failed (${response.statusCode ?? 0}): ${bodyText}`));
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

							onEvent(JSON.parse(line.slice(6)) as Record<string, unknown>);
						}
						boundary = buffer.indexOf("\n\n");
					}
				});
				response.on("end", resolve);
			},
		);

		request.on("error", reject);
		request.write(payload);
		request.end();
	});
}
