// @ts-nocheck Come back to this when views are supported again

import { describe, expect, it } from "vitest";

import useTestSchema from "../tests/useSchema.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";
import type { ViewColumn, ViewDetails } from "./extractView.ts";
import extractView from "./extractView.ts";
import type { PgType } from "./PgType.ts";

const makePgType = (name: string, schemaName: string): PgType<"view"> => ({
	schemaName,
	name,
	kind: "view",
	comment: null,
});

describe.skip("extractView", () => {
	const [getDbAdapter] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should extract simplified as well as full information_schema information", async () => {
		const db = getDbAdapter();
		await db.query(`create view ${schemaName}.some_view as select 1 as id`);

		const result = await extractView(db, makePgType("some_view", schemaName));

		const expected: ViewDetails = {
			name: "some_view",
			schemaName,
			kind: "view",
			comment: null,
			definition: " SELECT 1 AS id;",
			informationSchemaValue: {
				table_catalog: databaseName,
				table_schema: schemaName,
				table_name: "some_view",
				view_definition: " SELECT 1 AS id;",
				check_option: "NONE",
				is_updatable: "NO",
				is_insertable_into: "NO",
				is_trigger_updatable: "NO",
				is_trigger_deletable: "NO",
				is_trigger_insertable_into: "NO",
			},
			columns: [
				{
					name: "id",
					expandedType: "pg_catalog.int4",
					isArray: false,
					type: {
						fullName: "pg_catalog.int4",
						kind: "base",
					},
					comment: null,
					maxLength: null,
					defaultValue: null,
					isIdentity: false,
					isUpdatable: false,
					ordinalPosition: 1,
					generated: "NEVER",
					source: null,
					informationSchemaValue: {
						table_catalog: databaseName,
						table_schema: schemaName,
						table_name: "some_view",
						column_name: "id",
						ordinal_position: 1,
						column_default: null,
						is_nullable: "YES",
						data_type: "integer",
						character_maximum_length: null,
						character_octet_length: null,
						numeric_precision: 32,
						numeric_precision_radix: 2,
						numeric_scale: 0,
						datetime_precision: null,
						interval_type: null,
						interval_precision: null,
						character_set_catalog: null,
						character_set_schema: null,
						character_set_name: null,
						collation_catalog: null,
						collation_schema: null,
						collation_name: null,
						domain_catalog: null,
						domain_schema: null,
						domain_name: null,
						udt_catalog: databaseName,
						udt_schema: "pg_catalog",
						udt_name: "int4",
						scope_catalog: null,
						scope_schema: null,
						scope_name: null,
						maximum_cardinality: null,
						dtd_identifier: "1",
						is_self_referencing: "NO",
						is_identity: "NO",
						identity_generation: null,
						identity_start: null,
						identity_increment: null,
						identity_maximum: null,
						identity_minimum: null,
						identity_cycle: "NO",
						is_generated: "NEVER",
						generation_expression: null,
						is_updatable: "NO",
					},
				},
			],
			options: {
				checkOption: null,
				securityBarrier: false,
				securityInvoker: false,
			},
		};

		expect(result).toStrictEqual(expected);
	});

	it("should fetch column comments", async () => {
		const db = getDbAdapter();
		await db.query(`create view ${schemaName}.some_view as select 1 as id`);
		await db.query(
			`comment on column ${schemaName}.some_view.id is 'id column'`,
		);

		const result = await extractView(db, makePgType("some_view", schemaName));

		expect(result.columns[0]!.comment).toBe("id column");
	});

	it("should handle domains, composite types, ranges and enums as well as arrays of those", async () => {
		const db = getDbAdapter();
		await db.query(`create domain ${schemaName}.some_domain as text`);
		await db.query(
			`create type ${schemaName}.some_composite as (id integer, name text)`,
		);
		await db.query(
			`create type ${schemaName}.some_range as range(subtype=timestamptz)`,
		);
		await db.query(
			`create type ${schemaName}.some_enum as enum ('a', 'b', 'c')`,
		);

		await db.query(
			`create table ${schemaName}.some_table (
		d ${schemaName}.some_domain,
		c ${schemaName}.some_composite,
		r ${schemaName}.some_range,
		e ${schemaName}.some_enum,
		d_a ${schemaName}.some_domain[],
		c_a ${schemaName}.some_composite[],
		r_a ${schemaName}.some_range[],
		e_a ${schemaName}.some_enum[]
	)`,
		);

		await db.query(
			`create view ${schemaName}.some_view as select * from ${schemaName}.some_table`,
		);

		const result = await extractView(db, makePgType("some_view", schemaName));
		const actual = result.columns.map(column => ({
			name: column.name,
			expandedType: column.expandedType,
			type: column.type,
			isArray: column.isArray,
		}));

		const expected: Partial<ViewColumn>[] = [
			{
				name: "d",
				expandedType: "test.some_domain",
				type: {
					fullName: "test.some_domain",
					kind: "domain",
				},
				isArray: false,
			},
			{
				name: "c",
				expandedType: "test.some_composite",
				type: { fullName: "test.some_composite", kind: "composite" },
				isArray: false,
			},
			{
				name: "r",
				expandedType: "test.some_range",
				type: {
					fullName: "test.some_range",
					kind: "range",
				},
				isArray: false,
			},
			{
				name: "e",
				expandedType: "test.some_enum",
				type: { fullName: "test.some_enum", kind: "enum" },
				isArray: false,
			},
			{
				name: "d_a",
				expandedType: "test.some_domain[]",
				type: {
					fullName: "test.some_domain",
					kind: "domain",
				},
				isArray: true,
			},
			{
				name: "c_a",
				expandedType: "test.some_composite[]",
				type: { fullName: "test.some_composite", kind: "composite" },
				isArray: true,
			},
			{
				name: "r_a",
				expandedType: "test.some_range[]",
				type: {
					fullName: "test.some_range",
					kind: "range",
				},
				isArray: true,
			},
			{
				name: "e_a",
				expandedType: "test.some_enum[]",
				type: { fullName: "test.some_enum", kind: "enum" },
				isArray: true,
			},
		];

		expect(actual).toEqual(expected);
	});

	it("should report the correct source", async () => {
		const db = getDbAdapter();
		await db.query(
			`create table ${schemaName}.some_table (id integer not null)`,
		);
		await db.query(
			`create view ${schemaName}.some_view as select * from ${schemaName}.some_table`,
		);

		const result = await extractView(db, makePgType("some_view", schemaName));

		expect(result.columns[0]!.type.fullName).toBe("pg_catalog.int4");
		expect(result.columns[0]!.source).toEqual({
			schema: schemaName,
			table: "some_table",
			column: "id",
		});
	});

	it("should extract view options", async () => {
		const db = getDbAdapter();
		await db.query(`create table ${schemaName}.source_table (id integer)`);
		await db.query(`
	  create view ${schemaName}.some_view 
	  with (check_option = local, security_barrier = true, security_invoker = true) 
	  as select id from ${schemaName}.source_table
	`);

		const result = await extractView(db, makePgType("some_view", schemaName));

		expect(result.options).toEqual({
			checkOption: "local",
			securityBarrier: true,
			securityInvoker: true,
		});
	});

	it("should handle views without explicit options", async () => {
		const db = getDbAdapter();
		await db.query(`create view ${schemaName}.some_view as select 1 as id`);

		const result = await extractView(db, makePgType("some_view", schemaName));

		expect(result.options).toEqual({
			checkOption: null,
			securityBarrier: false,
			securityInvoker: false,
		});
	});
});
