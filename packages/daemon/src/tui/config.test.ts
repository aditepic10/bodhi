import { describe, expect, test } from "bun:test";
import { BodhiConfigSchema } from "@bodhi/types";
import { loadTuiConfig } from "./config";

describe("tui config", () => {
	test("loads defaults when no tui config file exists", () => {
		const config = BodhiConfigSchema.parse({
			config_dir: "/tmp/bodhi-tui-config-missing",
			data_dir: "/tmp/bodhi-tui-config-missing",
			socket_path: "/tmp/bodhi-tui-config-missing/bodhi.sock",
		});

		expect(loadTuiConfig(config)).toEqual({
			density: "comfortable",
			motion: "full",
			show_status_bar: true,
			theme: "dark",
		});
	});
});
