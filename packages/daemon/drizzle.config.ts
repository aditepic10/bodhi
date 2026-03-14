import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/**/*.sql.ts",
	out: "./src/store/migrations",
	dbCredentials: {
		url: process.env.BODHI_DB_PATH ?? "./bodhi.db",
	},
});
