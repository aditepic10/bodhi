import { hostname } from "node:os";
import type { BodhiEvent, CaptureSource, Fact, StoredEvent } from "@bodhi/types";

import { type RunningApiServer, startApiServer } from "./api/server";
import { createEventBus, type EventBus } from "./bus";
import { loadConfig } from "./config";
import { createFatalHandler } from "./daemon-fatal";
import { createIntelService, type IntelService } from "./intel/service";
import {
	bootstrap,
	cleanStaleSocket,
	type DaemonContext,
	drainSpool,
	removePidFile,
} from "./lifecycle";
import { createPipeline, type Pipeline } from "./pipeline/pipeline";
import type { SqliteStore } from "./store/sqlite";

const DEFAULT_SPOOL_DRAIN_INTERVAL_MS = 60_000;

export interface RunningDaemon {
	bus: EventBus;
	context: DaemonContext;
	intel: IntelService;
	pipeline: Pipeline;
	server: RunningApiServer;
	shutdown(): Promise<void>;
	store: SqliteStore;
}

export interface StartDaemonOptions {
	captureSources?: readonly CaptureSource[];
	config?: Parameters<typeof loadConfig>[0];
	spoolDrainIntervalMs?: number;
	startServer?: typeof startApiServer;
}

async function emitStoredEvent(
	bus: EventBus,
	transformed: BodhiEvent,
	stored: StoredEvent,
): Promise<void> {
	bus.emit(transformed.type, transformed);
	bus.emit("event:stored", stored);
}

export async function startDaemon(options: StartDaemonOptions = {}): Promise<RunningDaemon> {
	const config = loadConfig(options.config);
	const context = await bootstrap(config);
	const captureSources = [...(options.captureSources ?? [])];
	const bus = createEventBus(context.log);
	const pipeline = createPipeline({
		config: config.pipeline,
		enrich: {
			machineId: hostname(),
		},
	});
	const intel = createIntelService({
		config,
		log: context.log,
		pipeline,
		store: context.store,
	});
	const subscribedEventTypes = captureSources.flatMap((source) => source.eventTypes);

	context.log.info("daemon starting", {
		capture_sources: captureSources.map((source) => source.name),
		capture_types: subscribedEventTypes,
	});

	const factUnsubscribe = intel.onFactExtracted((fact: Fact) => {
		bus.emit("fact:extracted", fact);
	});
	const storedUnsubscribe = bus.on("event:stored", (event) => {
		intel.enqueue(event);
	});

	await intel.start();
	const prunedSessions = await context.store.pruneConversations(config.conversations.max_sessions);
	if (prunedSessions > 0) {
		context.log.info("pruned old conversations", { count: prunedSessions });
	}

	const drainedAtStartup = await drainSpool(
		context.store,
		pipeline,
		config.data_dir,
		context.log,
		async ({ stored, transformed }) => {
			await emitStoredEvent(bus, transformed, stored);
		},
	);
	if (drainedAtStartup > 0) {
		context.log.info("drained startup spool", { count: drainedAtStartup });
	}

	for (const captureSource of captureSources) {
		await captureSource.start();
	}

	const serverFactory = options.startServer ?? startApiServer;
	const server = serverFactory(
		{
			authToken: context.authToken,
			bus,
			config,
			log: context.log,
			pipeline,
			store: context.store,
		},
		{
			getIntelHealth: () => intel.getHealth(),
		},
	);

	const spoolInterval = setInterval(() => {
		void drainSpool(
			context.store,
			pipeline,
			config.data_dir,
			context.log,
			async ({ stored, transformed }) => {
				await emitStoredEvent(bus, transformed, stored);
			},
		).then((count) => {
			if (count > 0) {
				context.log.info("drained runtime spool", { count });
			}
		});
	}, options.spoolDrainIntervalMs ?? DEFAULT_SPOOL_DRAIN_INTERVAL_MS);

	let shuttingDown = false;
	return {
		bus,
		context,
		intel,
		pipeline,
		server,
		store: context.store,
		async shutdown() {
			if (shuttingDown) {
				return;
			}

			shuttingDown = true;
			clearInterval(spoolInterval);
			context.log.info("daemon shutting down");
			await intel.drain();
			factUnsubscribe();
			storedUnsubscribe();
			for (const captureSource of [...captureSources].reverse()) {
				await captureSource.stop();
			}
			await server.stop();
			context.store.close();
			removePidFile(`${config.data_dir}/bodhi.pid`);
			if (config.transport === "unix") {
				cleanStaleSocket(config.socket_path);
			}
		},
	};
}

async function main(): Promise<void> {
	const daemon = await startDaemon();

	let shuttingDown = false;
	const shutdown = async () => {
		if (shuttingDown) {
			return;
		}

		shuttingDown = true;
		await daemon.shutdown();
	};
	const handleFatal = createFatalHandler({
		exit(code) {
			process.exit(code);
		},
		log: daemon.context.log,
		shutdown,
	});

	process.on("SIGINT", () => {
		void shutdown();
	});
	process.on("SIGTERM", () => {
		void shutdown();
	});
	process.on("uncaughtException", (error) => {
		void handleFatal("uncaughtException", error);
	});
	process.on("unhandledRejection", (reason) => {
		void handleFatal("unhandledRejection", reason);
	});
}

if (import.meta.main) {
	await main();
}
