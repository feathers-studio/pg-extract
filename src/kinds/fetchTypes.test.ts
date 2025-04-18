import { describe, expect, it } from "vitest";

import useTestSchema from "../tests/useSchema.ts";
import fetchTypes from "./fetchTypes.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";

describe("fetchTypes", () => {
	const [getDbAdapter] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should fetch a simple type", async () => {
		const db = getDbAdapter();
		await db.query(`create table ${schemaName}.some_table (id integer)`);

		const types = await fetchTypes(db, [schemaName]);

		expect(types).toHaveLength(1);
		expect(types[0]).toEqual({
			name: "some_table",
			schemaName,
			kind: "table",
			comment: null,
		});
	});

	it("should fetch all kinds", async () => {
		const db = getDbAdapter();
		await db.query(`create table ${schemaName}.some_table (id integer)`);
		// TODO: fix view extraction
		// await db.query(`create view ${schemaName}.some_view as select 1 as id`);
		await db.query(
			`create materialized view ${schemaName}.some_materialized_view as select 1 as id`,
		);
		await db.query(
			`create type ${schemaName}.some_composite_type as (id integer)`,
		);
		await db.query(`create type ${schemaName}.some_enum as enum ('a', 'b')`);
		await db.query(`create domain ${schemaName}.some_domain as text`);
		await db.query(
			`create type ${schemaName}.some_range as range (subtype = integer)`,
		);
		await db.query(
			`create procedure ${schemaName}.some_procedure() language sql as $$ select 1 as id $$`,
		);
		await db.query(
			`create function ${schemaName}.some_function() returns integer language sql as $$ select 1 as id $$`,
		);
		// await db.query(
		//   `create aggregate ${schemaName}.some_aggregate (numeric) ( sfunc = numeric_add, stype = numeric, initcond = '0');`
		// );

		const types = await fetchTypes(db, [schemaName]);
		expect(
			Object.fromEntries(
				types.map(t => [t.name, t.kind] satisfies [string, string]),
			),
		).toEqual({
			some_function: "function",
			some_materialized_view: "materializedView",
			some_table: "table",
			some_procedure: "procedure",
			some_domain: "domain",
			some_composite_type: "composite",
			some_range: "range",
			some_enum: "enum",
			// TODO: these need to be uncommented when view extraction is fixed
			// some_view: "view",
			// some_multirange: 'multiRange',
			// some_aggregate: 'aggregate',
		});
	});

	it("should fetch comments", async () => {
		const db = getDbAdapter();

		// Tables are a "class" in postgres.
		await db.query(`create table ${schemaName}.some_table (id integer)`);
		await db.query(
			`comment on table ${schemaName}.some_table is 'some table comment'`,
		);

		// Domains are "types", which is different. Make sure we get those commments as well.
		await db.query(`create domain ${schemaName}.some_domain as text`);
		await db.query(
			`comment on domain ${schemaName}.some_domain is 'some domain comment'`,
		);

		// Composite types are both types and classes. The comment comes from the class.
		await db.query(
			`create type ${schemaName}.some_composite_type as (id integer)`,
		);
		await db.query(
			`comment on type ${schemaName}.some_composite_type is 'some composite type comment'`,
		);

		const types = await fetchTypes(db, [schemaName]);
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
