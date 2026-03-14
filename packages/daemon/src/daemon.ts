import { hostname } from "node:os";

import { startApiServer } from "./api/server";
import { createEventBus } from "./bus";
import { loadConfig } from "./config";
import { bootstrap, cleanStaleSocket, drainSpool, removePidFile } from "./lifecycle";
import { createPipeline } from "./pipeline/pipeline";

async function main(): Promise<void> {
	const config = loadConfig();
	const context = await bootstrap(config);
	const bus = createEventBus(context.log);
	const pipeline = createPipeline({
		config: config.pipeline,
		enrich: {
			machineId: hostname(),
		},
	});

	await drainSpool(context.store, pipeline, config.data_dir, context.log);

	const server = startApiServer({
		authToken: context.authToken,
		bus,
		config,
		log: context.log,
		pipeline,
		store: context.store,
	});

	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) {
			return;
		}

		shuttingDown = true;
		context.log.info("daemon shutting down");
		server.stop();
		context.store.close();
		removePidFile(`${config.data_dir}/bodhi.pid`);
		if (config.transport === "unix") {
			cleanStaleSocket(config.socket_path);
		}
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

await main();
