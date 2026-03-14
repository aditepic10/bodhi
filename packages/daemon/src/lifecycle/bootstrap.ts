import { join } from "node:path";
import type { BodhiConfig } from "@bodhi/types";

import { createLogger } from "../logger";
import {
	applyPragmas,
	createStore,
	ensureCoreSchema,
	openDatabase,
	setupFts,
} from "../store/sqlite";
import { ensureAuthToken, ensureDir, getDiskFreeMb } from "./filesystem";
import { cleanStalePidFile, cleanStaleSocket, writePidFile } from "./process";
import type { DaemonContext } from "./types";

const MIN_DISK_MB = 100;
const WARN_DISK_MB = 500;

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
		authToken,
		config,
		db,
		disk_free_mb: diskFreeMb,
		log,
		store,
	};
}
