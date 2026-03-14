export type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown> & {
	event_id?: string;
};

const levelOrder: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
}

export function createLogger(level: LogLevel = "info"): Logger {
	const threshold = levelOrder[level];

	const write = (entryLevel: LogLevel, message: string, fields: LogFields = {}) => {
		if (levelOrder[entryLevel] < threshold) {
			return;
		}

		process.stderr.write(
			`${JSON.stringify({ ts: new Date().toISOString(), level: entryLevel, message, ...fields })}\n`,
		);
	};

	return {
		debug: (message, fields) => write("debug", message, fields),
		info: (message, fields) => write("info", message, fields),
		warn: (message, fields) => write("warn", message, fields),
		error: (message, fields) => write("error", message, fields),
	};
}
