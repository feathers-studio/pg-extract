import { DbAdapter } from "../adapter.ts";
import { afterEach, beforeEach } from "vitest";

const useSchema = (getDb: () => DbAdapter, schemaName: string): void => {
	beforeEach(async () => {
		const db = getDb();
		await db.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
	});

	afterEach(async () => {
		const db = getDb();
		await db.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
	});
};

export default useSchema;
