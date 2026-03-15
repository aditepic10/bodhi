import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import React from "react";
import { TuiConfigSchema } from "./config";
import { renderTranscriptEntry } from "./renderers/registry";
import { resolveTuiTheme } from "./theme";

const theme = resolveTuiTheme(TuiConfigSchema.parse({}));

describe("tui renderers", () => {
	test("renders memory-search as inline indicator with counts", () => {
		const output = renderToString(
			React.createElement(
				React.Fragment,
				null,
				renderTranscriptEntry(
					{
						id: "tool-1",
						output: {
							events: [{ type: "ai.prompt" }, { type: "ai.tool_call" }],
							facts: [{ key: "username", value: "aditpareek" }],
						},
						role: "tool",
						status: "complete",
						summary: "Tool result: memory-search",
						toolName: "memory-search",
					},
					theme,
				),
			),
		);

		expect(output).toContain("searched memory");
		expect(output).toContain("2 events");
		expect(output).toContain("1 facts");
		expect(output).toContain("↳");
	});

	test("renders store-fact as inline indicator with key=value", () => {
		const output = renderToString(
			React.createElement(
				React.Fragment,
				null,
				renderTranscriptEntry(
					{
						id: "tool-2",
						output: {
							key: "preferred_shell",
							status: "active",
							value: "zsh",
						},
						role: "tool",
						status: "complete",
						summary: "Tool result: store-fact",
						toolName: "store-fact",
					},
					theme,
				),
			),
		);

		expect(output).toContain("stored preferred_shell = zsh");
		expect(output).toContain("↳");
	});

	test("suppresses Bodhi label for continuation entries", () => {
		const output = renderToString(
			React.createElement(
				React.Fragment,
				null,
				renderTranscriptEntry(
					{
						id: "assistant-msg-1-cont-3",
						role: "assistant",
						status: "complete",
						text: "Here are the results",
					},
					theme,
				),
			),
		);

		expect(output).toContain("Here are the results");
		expect(output).not.toContain("Bodhi");
	});

	test("shows Bodhi label for regular assistant entries", () => {
		const output = renderToString(
			React.createElement(
				React.Fragment,
				null,
				renderTranscriptEntry(
					{
						id: "assistant-msg-1",
						role: "assistant",
						status: "complete",
						text: "Hello",
					},
					theme,
				),
			),
		);

		expect(output).toContain("Bodhi");
		expect(output).toContain("Hello");
	});

	test("renders generic tool as inline indicator", () => {
		const output = renderToString(
			React.createElement(
				React.Fragment,
				null,
				renderTranscriptEntry(
					{
						id: "tool-3",
						role: "tool",
						status: "streaming",
						summary: "Processing data",
						toolName: "custom-tool",
					},
					theme,
				),
			),
		);

		expect(output).toContain("↳");
		expect(output).toContain("custom-tool");
		expect(output).toContain("Processing data");
	});
});
