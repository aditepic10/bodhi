import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
