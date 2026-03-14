import { sql } from "drizzle-orm";

export const unixEpochNow = sql`(unixepoch())`;

export const timestampsColumns = {
	created_at: unixEpochNow,
	updated_at: unixEpochNow,
};

export function nowUnix(): number {
	return Math.floor(Date.now() / 1000);
}
