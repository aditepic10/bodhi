import type { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { BodhiConfig, BodhiEvent } from "@bodhi/types";

import { createLogger, type Logger } from "./logger";
import {
	applyPragmas,
	createStore,
	ensureCoreSchema,
	openDatabase,
	type PipelineLike,
	type SqliteStore,
	setupFts,
	sourceForEvent,
} from "./store/sqlite";

const MIN_DISK_MB = 100;
const WARN_DISK_MB = 500;

export interface DaemonContext {
	config: BodhiConfig;
	db: Database;
	store: SqliteStore;
	log: Logger;
	authToken: string;
	disk_free_mb: number;
}

export function ensureDir(path: string, mode: number): void {
	mkdirSync(path, { recursive: true, mode });
	chmodSync(path, mode);
}

export function getDiskFreeMb(path: string): number {
	const output = execFileSync("df", ["-k", path], { encoding: "utf8" });
	const lines = output.trim().split("\n");
	const fields = lines.at(-1)?.trim().split(/\s+/) ?? [];
	const availableKb = Number(fields[3] ?? 0);
	return Math.floor(availableKb / 1024);
}

export function ensureAuthToken(path: string): string {
	if (existsSync(path)) {
		return readFileSync(path, "utf8").trim();
	}

	const token = randomBytes(32).toString("hex");
	writeFileSync(path, `${token}\n`, { mode: 0o600 });
	chmodSync(path, 0o600);
	return token;
}

export function cleanStalePidFile(path: string): void {
	if (!existsSync(path)) {
		return;
	}

	const value = readFileSync(path, "utf8").trim();
	const pid = Number(value);
	if (!Number.isFinite(pid) || pid <= 0) {
		unlinkSync(path);
		return;
	}

	try {
		process.kill(pid, 0);
	} catch {
		unlinkSync(path);
	}
}

export function writePidFile(path: string): void {
	writeFileSync(path, `${process.pid}\n`, { mode: 0o600 });
	chmodSync(path, 0o600);
}

export function removePidFile(path: string): void {
	if (existsSync(path)) {
		unlinkSync(path);
	}
}

export function cleanStaleSocket(path: string): void {
	if (existsSync(path)) {
		rmSync(path, { force: true });
	}
}

export async function drainSpool(
	store: SqliteStore,
	pipeline: PipelineLike,
	dataDir: string,
	log: Logger,
	onStored?: (event: {
		raw: BodhiEvent;
		transformed: BodhiEvent;
		stored: Awaited<ReturnType<SqliteStore["appendEvent"]>>;
	}) => void | Promise<void>,
): Promise<number> {
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

	let drained = 0;

	for (const spoolFile of spoolFiles.values()) {
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

export async function bootstrap(config: BodhiConfig): Promise<DaemonContext> {
	ensureDir(config.config_dir, 0o700);
	ensureDir(config.data_dir, 0o700);

	const diskFreeMb = getDiskFreeMb(config.data_dir);
	if (diskFreeMb < MIN_DISK_MB) {
		throw new Error(`insufficient disk space: ${diskFreeMb}MB free`);
	}

	const log = createLogger(config.log_level);
	if (diskFreeMb < WARN_DISK_MB) {
		log.warn("low disk space", { disk_free_mb: diskFreeMb });
	}

	const authToken = ensureAuthToken(join(config.config_dir, "auth-token"));
	const db = openDatabase(join(config.data_dir, "bodhi.db"));
	applyPragmas(db);
	ensureCoreSchema(db);
	setupFts(db);

	const store = createStore(db, {
		autoApprove: config.intel.auto_approve,
	});

	cleanStalePidFile(join(config.data_dir, "bodhi.pid"));
	writePidFile(join(config.data_dir, "bodhi.pid"));
	cleanStaleSocket(config.socket_path);

	return {
		config,
		db,
		store,
		log,
		authToken,
		disk_free_mb: diskFreeMb,
	};
}
