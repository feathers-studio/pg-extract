import { describe, expect, it } from "vitest";

import fetchExtensionItemIds from "./fetchExtensionItemIds.js";
import useSchema from "./tests/useSchema.js";
import useTestDbAdapter from "./tests/useTestDbAdapter.js";

interface PgClass {
	relname: string;
}

interface PgType {
	typname: string;
}

interface PgProc {
	proname: string;
}

describe.skip("fetchExtensionItemIds", () => {
	const [getDbAdapter] = useTestDbAdapter();
	useSchema(getDbAdapter, "test");

	// NOTE: be aware that this test depends on specifics of certain Postgres extensions.
	// If it fails there is a chance that it's because the extensions themselves have changed,
	// not necessarily the test.
	it("should fetch extension item ids", async () => {
		const db = getDbAdapter();

		await db.query("create extension if not exists pg_trgm");
		await db.query("create extension if not exists citext");

		const r = await fetchExtensionItemIds(db);

		console.log("extClassOids");

		const classes = [];
		for (const extClassOid of r.extClassOids) {
			const c = await db.query<PgClass>(
				`select * from pg_catalog.pg_class where oid = ${extClassOid}`,
			);
			classes.push(c[0]!.relname);
		}

		console.log("classes");

		const types = [];
		for (const extTypeOid of r.extTypeOids) {
			const c = await db.query<PgType>(
				`select * from pg_catalog.pg_type where oid = ${extTypeOid}`,
			);
			types.push(c[0]!.typname);
		}
		expect(types).toContain("gtrgm");
		expect(types).toContain("citext");

		const procs = [];
		for (const extProcOid of r.extProcOids) {
			const c = await db.query<PgProc>(
				`select * from pg_catalog.pg_proc where oid = ${extProcOid}`,
			);
			procs.push(c[0]!.proname);
		}
		expect(procs).toContain("gtrgm_in");
		expect(procs).toContain("citextin");

		await db.query("drop extension pg_trgm");
		await db.query("drop extension citext");
	});
});
