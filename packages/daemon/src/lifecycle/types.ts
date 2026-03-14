import type { Database } from "bun:sqlite";
import type { BodhiConfig } from "@bodhi/types";

import type { Logger } from "../logger";
import type { SqliteStore } from "../store/sqlite";

export interface DaemonContext {
	config: BodhiConfig;
	db: Database;
	store: SqliteStore;
	log: Logger;
	authToken: string;
	disk_free_mb: number;
}
