import type { AssistantCaptureSource } from "./types";

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function resolveBodhiBinary(): string {
	return Bun.which("bodhi") ?? "bodhi";
}

export function assistantCaptureCommand(source: AssistantCaptureSource): string {
	const pathExport = process.env.PATH?.trim()
		? `PATH=${shellQuote(process.env.PATH)}; export PATH; `
		: "";
	const body = `${pathExport}${shellQuote(resolveBodhiBinary())} internal ai-capture ${source} >/dev/null 2>&1 || true`;
	return `bash -c ${shellQuote(body)}`;
}

export function assistantCaptureArgv(source: AssistantCaptureSource): readonly string[] {
	return ["bodhi", "internal", "ai-capture", source];
}
