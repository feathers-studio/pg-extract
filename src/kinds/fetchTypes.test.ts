import { describe, expect, it } from "vitest";

import useSchema from "../tests/useSchema.ts";
import fetchTypes from "./fetchTypes.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";

describe("fetchTypes", () => {
	const [getDbAdapter] = useTestDbAdapter();
	useSchema(getDbAdapter, "test");

	it("should fetch a simple type", async () => {
		const db = getDbAdapter();
		await db.query("create table test.some_table (id integer)");

		const types = await fetchTypes(db, ["test"]);

		expect(types).toHaveLength(1);
		expect(types[0]).toEqual({
			name: "some_table",
			schemaName: "test",
			kind: "table",
			comment: null,
		});
	});

	it("should fetch all kinds", async () => {
		const db = getDbAdapter();
		await db.query("create table test.some_table (id integer)");
		await db.query("create view test.some_view as select 1 as id");
		await db.query(
			"create materialized view test.some_materialized_view as select 1 as id",
		);
		await db.query("create type test.some_composite_type as (id integer)");
		await db.query("create type test.some_enum as enum ('a', 'b')");
		await db.query("create domain test.some_domain as text");
		await db.query("create type test.some_range as range (subtype = integer)");
		await db.query(
			"create procedure test.some_procedure() language sql as $$ select 1 as id $$",
		);
		await db.query(
			"create function test.some_function() returns integer language sql as $$ select 1 as id $$",
		);
		// await db.query(
		//   "create aggregate test.some_aggregate (numeric) ( sfunc = numeric_add, stype = numeric, initcond = '0');"
		// );

		const types = await fetchTypes(db, ["test"]);
		expect(
			Object.fromEntries(
				types.map(t => [t.name, t.kind] satisfies [string, string]),
			),
		).toEqual(
			Object.fromEntries([
				["some_function", "function"],
				["some_materialized_view", "materializedView"],
				["some_table", "table"],
				["some_procedure", "procedure"],
				["some_domain", "domain"],
				["some_composite_type", "composite"],
				["some_range", "range"],
				["some_view", "view"],
				["some_enum", "enum"],
				// ['some_multirange', 'multiRange'],
				// ['some_aggregate', 'aggregate'],
			] satisfies [string, string][]),
		);
	});

	it("should fetch comments", async () => {
		const db = getDbAdapter();

		// Tables are a "class" in postgres.
		await db.query("create table test.some_table (id integer)");
		await db.query("comment on table test.some_table is 'some table comment'");

		// Domains are "types", which is different. Make sure we get those commments as well.
		await db.query("create domain test.some_domain as text");
		await db.query(
			"comment on domain test.some_domain is 'some domain comment'",
		);

		// Composite types are both types and classes. The comment comes from the class.
		await db.query("create type test.some_composite_type as (id integer)");
		await db.query(
			"comment on type test.some_composite_type is 'some composite type comment'",
		);

		const types = await fetchTypes(db, ["test"]);
		expect(
			Object.fromEntries(
				types.map(t => [t.name, t.comment] satisfies [string, string | null]),
			),
		).toEqual(
			Object.fromEntries([
				["some_domain", "some domain comment"],
				["some_table", "some table comment"],
				["some_composite_type", "some composite type comment"],
			] satisfies [string, string | null][]),
		);
	});
});
