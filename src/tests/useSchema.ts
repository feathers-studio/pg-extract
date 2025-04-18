import { DbAdapter } from "../adapter.ts";
import { afterEach, beforeEach } from "vitest";

const useTestSchema = (getDb: () => DbAdapter): string => {
	const schemaName = `test_${Math.ceil(Math.random() * 1000)}`;

	beforeEach(async () => {
		const db = getDb();
		await db.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
	});

	afterEach(async () => {
		const db = getDb();
		await db.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
	});

	return schemaName;
};

export default useTestSchema;
