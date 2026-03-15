import { describe, expect, test } from "bun:test";
import { TuiConfigSchema } from "./config";
import { renderTranscriptEntry } from "./renderers/registry";
import type { TranscriptEntry } from "./state";
import { resolveTuiTheme } from "./theme";

const theme = resolveTuiTheme(TuiConfigSchema.parse({}));

function renderToText(entry: TranscriptEntry): string {
	const node = renderTranscriptEntry(entry, theme);
	return extractText(node);
}

function extractText(node: unknown): string {
	if (node === null || node === undefined || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(extractText).join("");
	if (typeof node === "object" && "props" in node) {
		const props = (node as { props?: { children?: unknown } }).props;
		if (props?.children !== undefined) {
			return extractText(props.children);
		}
	}
	return "";
}

describe("tui renderers", () => {
	test("renders memory-search as inline indicator with counts", () => {
		const output = renderToText({
			id: "tool-1",
			output: {
				events: [{ type: "ai.prompt" }, { type: "ai.tool_call" }],
				facts: [{ key: "username", value: "aditpareek" }],
			},
			role: "tool",
			status: "complete",
			summary: "Tool result: memory-search",
			toolName: "memory-search",
		});

		expect(output).toContain("searched memory");
		expect(output).toContain("2 events, 1 facts");
		expect(output).toContain("◆");
	});

	test("renders store-fact as inline indicator with key=value", () => {
		const output = renderToText({
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
		});

		expect(output).toContain("stored preferred_shell = zsh");
		expect(output).toContain("◆");
	});

	test("suppresses Bodhi label for continuation entries", () => {
		const output = renderToText({
			id: "assistant-msg-1-cont-3",
			role: "assistant",
			status: "complete",
			text: "Here are the results",
		});

		expect(output).toContain("Here are the results");
		expect(output).not.toContain("Bodhi");
	});

	test("shows Bodhi label for regular assistant entries", () => {
		const output = renderToText({
			id: "assistant-msg-1",
			role: "assistant",
			status: "complete",
			text: "Hello",
		});

		expect(output).toContain("Bodhi");
		expect(output).toContain("Hello");
	});

	test("renders generic tool as inline indicator", () => {
		const output = renderToText({
			id: "tool-3",
			role: "tool",
			status: "streaming",
			summary: "Processing data",
			toolName: "custom-tool",
		});

		expect(output).toContain("◆");
		expect(output).toContain("custom-tool");
		expect(output).toContain("Processing data");
	});
});
