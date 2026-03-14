import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { type BodhiConfig, BodhiConfigSchema } from "@bodhi/types";

function expandHome(value: string): string {
	if (value === "~") {
		return homedir();
	}

	if (value.startsWith("~/")) {
		return join(homedir(), value.slice(2));
	}

	return value;
}

function readConfigFile(path: string): Record<string, unknown> {
	if (!existsSync(path)) {
		return {};
	}

	const contents = readFileSync(path, "utf8");
	return Bun.TOML.parse(contents) as Record<string, unknown>;
}

function mergeConfig(
	base: Record<string, unknown>,
	overrides: Record<string, unknown>,
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...base };

	for (const [key, value] of Object.entries(overrides)) {
		if (
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			merged[key] &&
			typeof merged[key] === "object" &&
			!Array.isArray(merged[key])
		) {
			merged[key] = mergeConfig(
				merged[key] as Record<string, unknown>,
				value as Record<string, unknown>,
			);
			continue;
		}

		merged[key] = value;
	}

	return merged;
}

export function resolveConfigPaths(config: BodhiConfig): BodhiConfig {
	return {
		...config,
		config_dir: expandHome(config.config_dir),
		data_dir: expandHome(config.data_dir),
		socket_path: expandHome(config.socket_path),
	};
}

export function loadConfig(overrides: Record<string, unknown> = {}): BodhiConfig {
	const defaultConfig = resolveConfigPaths(BodhiConfigSchema.parse({}));
	const configPath = join(defaultConfig.config_dir, "config.toml");
	const fileConfig = readConfigFile(configPath);

	const envConfig: Record<string, unknown> = {};
	if (process.env.BODHI_TRANSPORT) {
		envConfig.transport = process.env.BODHI_TRANSPORT;
	}
	if (process.env.BODHI_PORT) {
		envConfig.port = Number(process.env.BODHI_PORT);
	}
	if (process.env.BODHI_LOG_LEVEL) {
		envConfig.log_level = process.env.BODHI_LOG_LEVEL;
	}
	if (process.env.BODHI_CAPTURE_LEVEL) {
		envConfig.capture = { level: process.env.BODHI_CAPTURE_LEVEL };
	}
	if (process.env.BODHI_AUTO_APPROVE) {
		envConfig.intel = {
			auto_approve: process.env.BODHI_AUTO_APPROVE === "true",
		};
	}

	return resolveConfigPaths(
		BodhiConfigSchema.parse(mergeConfig(mergeConfig(fileConfig, envConfig), overrides)),
	);
}
