import { describe, expect, test } from "bun:test";

import { createFatalHandler } from "./daemon-fatal";

describe("daemon fatal handling", () => {
	test("fatal handler logs, shuts down, and exits once", async () => {
		const entries: Array<{ fields?: Record<string, unknown>; message: string }> = [];
		let shutdownCalls = 0;
		const exitCodes: number[] = [];
		const handleFatal = createFatalHandler({
			exit(code) {
				exitCodes.push(code);
			},
			log: {
				debug() {},
				error(message, fields) {
					entries.push({ fields, message });
				},
				info() {},
				warn() {},
			},
			async shutdown() {
				shutdownCalls += 1;
			},
		});

		await handleFatal("uncaughtException", new Error("boom"));
		await handleFatal("unhandledRejection", new Error("ignored"));

		expect(shutdownCalls).toBe(1);
		expect(exitCodes).toEqual([1]);
		expect(entries).toEqual([
			{
				fields: {
					error: "boom",
				},
				message: "uncaughtException",
			},
		]);
	});

	test("fatal handler logs shutdown failure before exiting", async () => {
		const entries: Array<{ fields?: Record<string, unknown>; message: string }> = [];
		const exitCodes: number[] = [];
		const handleFatal = createFatalHandler({
			exit(code) {
				exitCodes.push(code);
			},
			log: {
				debug() {},
				error(message, fields) {
					entries.push({ fields, message });
				},
				info() {},
				warn() {},
			},
			async shutdown() {
				throw new Error("cannot close store");
			},
		});

		await handleFatal("unhandledRejection", "bad promise");

		expect(exitCodes).toEqual([1]);
		expect(entries).toEqual([
			{
				fields: {
					error: "bad promise",
				},
				message: "unhandledRejection",
			},
			{
				fields: {
					error: "cannot close store",
				},
				message: "fatal shutdown failed",
			},
		]);
	});
});
