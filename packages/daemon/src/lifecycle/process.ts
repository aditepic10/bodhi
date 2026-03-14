import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";

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
