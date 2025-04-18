import { describe, expect, it } from "vitest";

import useTestSchema from "../tests/useSchema.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";
import type {
	MaterializedViewColumn,
	MaterializedViewDetails,
} from "./extractMaterializedView.ts";
import extractMaterializedView from "./extractMaterializedView.ts";
import type { PgType } from "./PgType.ts";

const makePgType = (
	name: string,
	schemaName: string,
): PgType<"materializedView"> => ({
	schemaName,
	name,
	kind: "materializedView",
	comment: null,
});

describe("extractMaterializedView", () => {
	const [getDbAdapter, databaseName] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should extract simplified information", async () => {
		const db = getDbAdapter();
		await db.query(
			`create materialized view ${schemaName}.test_custom_matview as select 1 as id`,
		);

		const result = await extractMaterializedView(
			db,
			makePgType("test_custom_matview", schemaName),
		);

		const expected: MaterializedViewDetails = {
			name: "test_custom_matview",
			schemaName,
			kind: "materializedView",
			comment: null,
			definition: " SELECT 1 AS id;",
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
					isNullable: true,
					isIdentity: false,
					isUpdatable: false,
					ordinalPosition: 1,
					generated: "NEVER",
					fakeInformationSchemaValue: {
						table_catalog: databaseName,
						table_schema: schemaName,
						table_name: "test_custom_matview",
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
			fakeInformationSchemaValue: {
				table_catalog: databaseName,
				table_schema: schemaName,
				table_name: "test_custom_matview",
				view_definition: " SELECT 1 AS id;",
				check_option: "NONE",
				is_updatable: "NO",
				is_insertable_into: "NO",
				is_trigger_updatable: "NO",
				is_trigger_deletable: "NO",
				is_trigger_insertable_into: "NO",
			},
		};

		expect(result).toStrictEqual(expected);
	});

	it("should fetch column comments", async () => {
		const db = getDbAdapter();
		await db.query(
			`create materialized view ${schemaName}.some_materialized_view as select 1 as id`,
		);
		await db.query(
			`comment on column ${schemaName}.some_materialized_view.id is 'id column'`,
		);

		const result = await extractMaterializedView(
			db,
			makePgType("some_materialized_view", schemaName),
		);

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
			`create materialized view ${schemaName}.some_materialized_view as select * from ${schemaName}.some_table`,
		);

		const result = await extractMaterializedView(
			db,
			makePgType("some_materialized_view", schemaName),
		);

		const actual = result.columns.map(column => ({
			name: column.name,
			expandedType: column.expandedType,
			type: column.type,
			isArray: column.isArray,
		}));

		const expected: Partial<MaterializedViewColumn>[] = [
			{
				name: "d",
				expandedType: `${schemaName}.some_domain`,
				type: {
					fullName: `${schemaName}.some_domain`,
					kind: "domain",
				},
				isArray: false,
			},
			{
				name: "c",
				expandedType: `${schemaName}.some_composite`,
				type: { fullName: `${schemaName}.some_composite`, kind: "composite" },
				isArray: false,
			},
			{
				name: "r",
				expandedType: `${schemaName}.some_range`,
				type: {
					fullName: `${schemaName}.some_range`,
					kind: "range",
				},
				isArray: false,
			},
			{
				name: "e",
				expandedType: `${schemaName}.some_enum`,
				type: { fullName: `${schemaName}.some_enum`, kind: "enum" },
				isArray: false,
			},
			{
				name: "d_a",
				expandedType: `${schemaName}.some_domain[]`,
				type: {
					fullName: `${schemaName}.some_domain`,
					kind: "domain",
				},
				isArray: true,
			},
			{
				name: "c_a",
				expandedType: `${schemaName}.some_composite[]`,
				type: { fullName: `${schemaName}.some_composite`, kind: "composite" },
				isArray: true,
			},
			{
				name: "r_a",
				expandedType: `${schemaName}.some_range[]`,
				type: {
					fullName: `${schemaName}.some_range`,
					kind: "range",
				},
				isArray: true,
			},
			{
				name: "e_a",
				expandedType: `${schemaName}.some_enum[]`,
				type: { fullName: `${schemaName}.some_enum`, kind: "enum" },
				isArray: true,
			},
		];

		expect(actual).toEqual(expected);
	});
});
