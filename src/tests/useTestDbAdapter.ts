import { afterAll, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { DbAdapter } from "../adapter.js";

const useTestDbAdapter = (): readonly [() => DbAdapter, string] => {
	let dbAdapter: DbAdapter;

	// const database = `test_${Math.ceil(Math.random() * 1000)}`;
	const database = "template1";
	const pglite = new PGlite("memory://", {
		database,
		extensions: { pg_trgm, citext },
	});

	beforeAll(async () => {
		dbAdapter = new DbAdapter(pglite);
		console.log("created database", database);
	});

	afterAll(async () => {
		await dbAdapter.close();
		console.log("closed database", database);
	});

	return [() => dbAdapter, database] as const;
};

export default useTestDbAdapter;
