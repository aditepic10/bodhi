import {
	chmodSync,
	existsSync,
	readdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { BodhiEvent } from "@bodhi/types";

import type { Logger } from "../logger";
import { type PipelineLike, type SqliteStore, sourceForEvent } from "../store/sqlite";

type StoredCallback = (event: {
	raw: BodhiEvent;
	transformed: BodhiEvent;
	stored: Awaited<ReturnType<SqliteStore["appendEvent"]>>;
}) => void | Promise<void>;

function collectSpoolFiles(dataDir: string): string[] {
	const spoolFiles = new Map<string, string>();
	for (const name of readdirSync(dataDir)) {
		if (!name.startsWith("spool.") || !name.endsWith(".jsonl")) {
			continue;
		}

		const stableName = name.replace(".draining.jsonl", ".jsonl");
		const current = spoolFiles.get(stableName);
		if (!current || name.includes(".draining.")) {
			spoolFiles.set(stableName, name);
		}
	}

	return [...spoolFiles.values()];
}

export async function drainSpool(
	store: SqliteStore,
	pipeline: PipelineLike,
	dataDir: string,
	log: Logger,
	onStored?: StoredCallback,
): Promise<number> {
	let drained = 0;

	for (const spoolFile of collectSpoolFiles(dataDir)) {
		const drainingPath = join(dataDir, spoolFile);
		const sourcePath = join(dataDir, spoolFile.replace(".draining.jsonl", ".jsonl"));
		if (drainingPath === sourcePath) {
			renameSync(sourcePath, sourcePath.replace(/\.jsonl$/, ".draining.jsonl"));
		}

		const activeDrainingPath =
			drainingPath === sourcePath
				? sourcePath.replace(/\.jsonl$/, ".draining.jsonl")
				: drainingPath;
		const failedLines: string[] = [];

		try {
			const lines = readFileSync(activeDrainingPath, "utf8")
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);

			for (const line of lines) {
				try {
					const rawEvent = JSON.parse(line) as BodhiEvent;
					const transformed = pipeline.process(rawEvent);
					if (!transformed) {
						log.warn("spool event dropped by pipeline");
						continue;
					}

					const stored = await store.appendEvent(transformed, sourceForEvent(transformed));
					if (onStored) {
						await onStored({
							raw: rawEvent,
							stored,
							transformed,
						});
					}
					drained += 1;
				} catch (error) {
					failedLines.push(line);
					log.warn("failed to drain spool line", {
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		} finally {
			if (failedLines.length > 0) {
				writeFileSync(sourcePath, `${failedLines.join("\n")}\n`, { mode: 0o600 });
				chmodSync(sourcePath, 0o600);
			}

			if (existsSync(activeDrainingPath)) {
				unlinkSync(activeDrainingPath);
			}
		}
	}

	return drained;
}
