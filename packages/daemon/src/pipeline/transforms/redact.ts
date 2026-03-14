import type { BodhiEvent, Transform } from "@bodhi/types";

const REDACTED = "[REDACTED]";

type StringPath = Array<string | number>;

export interface RedactionMatch {
	start: number;
	end: number;
}

export interface RedactTransformOptions {
	scan?: (value: string) => RedactionMatch[];
}

const knownSecretPatterns: RegExp[] = [
	/AKIA[0-9A-Z]{16}/g,
	/ghp_[A-Za-z0-9]{20,}/g,
	/gho_[A-Za-z0-9]{20,}/g,
	/github_pat_[A-Za-z0-9_]{20,}/g,
	/sk-ant-[A-Za-z0-9\-_]{10,}/g,
	/sk-[A-Za-z0-9\-_]{20,}/g,
	/xox[baprs]-[A-Za-z0-9-]{10,}/g,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
	/(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^:\s]+:([^@\s]+)@/g,
];

const keywordAssignments =
	/\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|API_KEY|ACCESS_KEY)[A-Z0-9_]*)=([^\s]+)/gi;
const longFlags = /(--(?:password|pass|token|secret|key))(?:=|\s+)([^\s]+)/gi;
const mysqlPassword = /(-p)(['"]?)([^'"\s]+)\2/g;
const bearerHeader = /(Authorization:\s*Bearer\s+)([^\s'"]+)/gi;

function collectRegexMatches(text: string, pattern: RegExp, groupIndex?: number): RedactionMatch[] {
	const matches: RedactionMatch[] = [];
	const regex = new RegExp(pattern.source, pattern.flags);
	let match: RegExpExecArray | null = regex.exec(text);

	while (match) {
		if (groupIndex !== undefined) {
			const value = match[groupIndex];
			if (value) {
				const relativeIndex = match[0].lastIndexOf(value);
				const start = match.index + relativeIndex;
				matches.push({ start, end: start + value.length });
			}
		} else {
			matches.push({ start: match.index, end: match.index + match[0].length });
		}

		if (!regex.global) {
			break;
		}

		match = regex.exec(text);
	}

	return matches;
}

function detectKnownSecrets(text: string): RedactionMatch[] {
	return knownSecretPatterns.flatMap((pattern) => {
		if (pattern.source.includes("://")) {
			return collectRegexMatches(text, pattern, 1);
		}

		return collectRegexMatches(text, pattern);
	});
}

function detectKeywordSecrets(text: string): RedactionMatch[] {
	return [
		...collectRegexMatches(text, keywordAssignments, 2),
		...collectRegexMatches(text, longFlags, 2),
		...collectRegexMatches(text, mysqlPassword, 3),
		...collectRegexMatches(text, bearerHeader, 2),
	];
}

function mergeMatches(matches: RedactionMatch[]): RedactionMatch[] {
	const sorted = [...matches].sort((left, right) => left.start - right.start);
	const merged: RedactionMatch[] = [];

	for (const match of sorted) {
		const previous = merged.at(-1);
		if (!previous || match.start > previous.end) {
			merged.push({ ...match });
			continue;
		}

		previous.end = Math.max(previous.end, match.end);
	}

	return merged;
}

export function redactString(value: string, scan: (input: string) => RedactionMatch[]): string {
	const matches = mergeMatches(scan(value));
	if (matches.length === 0) {
		return value;
	}

	let cursor = 0;
	let redacted = "";
	for (const match of matches) {
		redacted += value.slice(cursor, match.start);
		redacted += REDACTED;
		cursor = match.end;
	}
	redacted += value.slice(cursor);
	return redacted;
}

function walkStrings(
	value: unknown,
	path: StringPath = [],
	matches: Array<{ path: StringPath; value: string }>,
): void {
	if (typeof value === "string") {
		matches.push({ path, value });
		return;
	}

	if (Array.isArray(value)) {
		value.forEach((entry, index) => {
			walkStrings(entry, [...path, index], matches);
		});
		return;
	}

	if (value && typeof value === "object") {
		for (const [key, entry] of Object.entries(value)) {
			walkStrings(entry, [...path, key], matches);
		}
	}
}

function setAtPath(target: unknown, path: StringPath, value: string): void {
	if (path.length === 0 || !target || typeof target !== "object") {
		return;
	}

	const [head, ...tail] = path;
	if (head === undefined) {
		return;
	}

	if (tail.length === 0) {
		(target as Record<string | number, unknown>)[head] = value;
		return;
	}

	setAtPath((target as Record<string | number, unknown>)[head], tail, value);
}

function defaultScan(value: string): RedactionMatch[] {
	return [...detectKnownSecrets(value), ...detectKeywordSecrets(value)];
}

export function createRedactTransform(options: RedactTransformOptions = {}): Transform {
	const scan = options.scan ?? defaultScan;

	return (event: BodhiEvent) => {
		try {
			const clone = structuredClone(event);
			const strings: Array<{ path: StringPath; value: string }> = [];
			walkStrings(clone.metadata, ["metadata"], strings);

			for (const entry of strings) {
				const redacted = redactString(entry.value, scan);
				setAtPath(clone, entry.path, redacted);
			}

			return clone;
		} catch {
			return null;
		}
	};
}
