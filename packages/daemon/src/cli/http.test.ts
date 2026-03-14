import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { BodhiConfigSchema } from "@bodhi/types";

import { normalizeRequestError } from "./http";

function makeUnixConfig() {
	return BodhiConfigSchema.parse({
		config_dir: "/tmp/bodhi-cli-http",
		data_dir: "/tmp/bodhi-cli-http",
		socket_path: join("/tmp", "bodhi-cli-http.sock"),
		transport: "unix",
	});
}

describe("cli http transport", () => {
	test("normalizes daemon-unreachable transport errors", () => {
		const config = makeUnixConfig();
		const normalized = normalizeRequestError(
			config,
			Object.assign(new Error("Was there a typo in the url or port?"), {
				code: "ENOENT",
			}),
			"connecting to",
		);

		expect(normalized.message).toBe(
			`could not reach Bodhi daemon at unix:${config.socket_path}; is it running?`,
		);
	});

	test("normalizes interrupted stream transport errors", () => {
		const config = makeUnixConfig();
		const normalized = normalizeRequestError(
			config,
			Object.assign(new Error("socket hang up"), {
				code: "ECONNRESET",
			}),
			"streaming from",
		);

		expect(normalized.message).toBe(
			`connection to Bodhi daemon was interrupted while streaming from unix:${config.socket_path}`,
		);
	});
});
