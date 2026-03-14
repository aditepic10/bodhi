import type { Logger } from "./logger";

export type FatalKind = "uncaughtException" | "unhandledRejection";

export interface FatalHandlerRuntime {
	exit(code: number): void;
	log: Logger;
	shutdown(): Promise<void>;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createFatalHandler(runtime: FatalHandlerRuntime) {
	let handling = false;

	return async (kind: FatalKind, error: unknown): Promise<void> => {
		if (handling) {
			return;
		}

		handling = true;
		runtime.log.error(kind, {
			error: errorMessage(error),
		});

		try {
			await runtime.shutdown();
		} catch (shutdownError) {
			runtime.log.error("fatal shutdown failed", {
				error: errorMessage(shutdownError),
			});
		}

		runtime.exit(1);
	};
}
