import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BodhiConfig } from "@bodhi/types";
import { z } from "zod";

export const TuiThemeNameSchema = z.enum(["dark"]);
export const TuiDensitySchema = z.enum(["comfortable", "compact"]);
export const TuiMotionSchema = z.enum(["full", "reduced", "none"]);

export const TuiConfigSchema = z.object({
	density: TuiDensitySchema.default("comfortable"),
	motion: TuiMotionSchema.default("full"),
	show_status_bar: z.boolean().default(true),
	theme: TuiThemeNameSchema.default("dark"),
});

export type TuiConfig = z.infer<typeof TuiConfigSchema>;

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

function readTuiConfigFile(config: BodhiConfig): Record<string, unknown> {
	const path = join(config.config_dir, "tui.toml");
	if (!existsSync(path)) {
		return {};
	}

	return Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function loadTuiConfig(
	config: BodhiConfig,
	overrides: Record<string, unknown> = {},
): TuiConfig {
	return TuiConfigSchema.parse(mergeConfig(mergeConfig(readTuiConfigFile(config), overrides), {}));
}
