import { describe, expect, it } from "vitest";

import useTestSchema from "../tests/useSchema.ts";
import type {
	ColumnReference,
	TableCheck,
	TableDetails,
	TableIndex,
	TableSecurityPolicy,
} from "./extractTable.ts";
import extractTable from "./extractTable.ts";
import type { PgType } from "./PgType.ts";
import { CanonicalType } from "./query-parts/canonicaliseTypes.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";

const makePgType = (name: string, schemaName: string): PgType<"table"> => ({
	schemaName,
	name,
	kind: "table",
	comment: null,
});

// const test = testWith({ schemaNames: ['test'] });
describe("extractTable", () => {
	const [getDbAdapter, databaseName] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should extract simplified as well as full information_schema information", async () => {
		const db = getDbAdapter();
		await db.query(`create table ${schemaName}.some_table (id integer)`);

		const result = await extractTable(db, makePgType("some_table", schemaName));

		const expected: TableDetails = {
			name: "some_table",
			schemaName,
			kind: "table",
			comment: null,
			informationSchemaValue: {
				table_catalog: databaseName,
				table_schema: schemaName,
				table_name: "some_table",
				table_type: "BASE TABLE",
				self_referencing_column_name: null,
				reference_generation: null,
				user_defined_type_catalog: null,
				user_defined_type_schema: null,
				user_defined_type_name: null,
				is_insertable_into: "YES",
				is_typed: "NO",
				commit_action: null,
			},
			indices: [],
			checks: [],
			columns: [
				{
					name: "id",
					type: {
						canonical_name: "pg_catalog.int4",
						kind: CanonicalType.TypeKind.Base,
						schema: "pg_catalog",
						name: "int4",
						dimensions: 0,
						original_type: "integer",
					},
					references: [],
					defaultValue: null,
					isNullable: true,
					isPrimaryKey: false,
					generated: "NEVER",
					isUpdatable: true,
					isIdentity: false,
					ordinalPosition: 1,
					comment: null,

					informationSchemaValue: {
						table_catalog: databaseName,
						table_schema: schemaName,
						table_name: "some_table",
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
						is_updatable: "YES",
					},
				},
			],
			isRowLevelSecurityEnabled: false,
			isRowLevelSecurityEnforced: false,
			securityPolicies: [],
		};

		expect(result).toStrictEqual(expected);
	});

	it("should fetch column comments", async () => {
		const db = getDbAdapter();
		await db.query(`create table ${schemaName}.some_table (id integer)`);
		await db.query(
			`comment on column ${schemaName}.some_table.id is 'id column'`,
		);

		const result = await extractTable(db, makePgType("some_table", schemaName));

		expect(result.columns[0]!.comment).toBe("id column");
	});

	it("should handle arrays of primitive types", async () => {
		const db = getDbAdapter();
		await db.query(
			`create table ${schemaName}.some_table (normal_int integer, array_of_ints integer[], array_of_strings text[], two_dimensional_array integer[][])`,
		);

		const result = await extractTable(db, makePgType("some_table", schemaName));

		const actual = result.columns.map(column => ({
			name: column.name,
			canonical_name: column.type.canonical_name,
			kind: column.type.kind,
			dimensions: column.type.dimensions,
		}));

		const expected: typeof actual = [
			{
				name: "normal_int",
				canonical_name: "pg_catalog.int4",
				kind: CanonicalType.TypeKind.Base,
				dimensions: 0,
			},
			{
				name: "array_of_ints",
				canonical_name: "pg_catalog.int4",
				kind: CanonicalType.TypeKind.Base,
				dimensions: 1,
			},
			{
				name: "array_of_strings",
				canonical_name: "pg_catalog.text",
				kind: CanonicalType.TypeKind.Base,
				dimensions: 1,
			},
			{
				name: "two_dimensional_array",
				canonical_name: "pg_catalog.int4",
				kind: CanonicalType.TypeKind.Base,
				dimensions: 2,
			},
		];
		expect(actual).toEqual(expected);
	});

	it("should fetch table checks", async () => {
		const db = getDbAdapter();
		await db.query(`create table ${schemaName}.some_table_with_checks (
		id integer constraint id_check check (id > 0),
		products TEXT[],
		number_of_products INT,
		constraint products_len_check check (array_length(products, 1) = number_of_products)
	)`);

		const result = await extractTable(
			db,
			makePgType("some_table_with_checks", schemaName),
		);
		const actual = result.checks;

		const expected: TableCheck[] = [
			{ name: "id_check", clause: "id > 0" },
			{
				name: "products_len_check",
				clause: "array_length(products, 1) = number_of_products",
			},
		];

		expect(actual).toEqual(expected);
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

		const result = await extractTable(db, makePgType("some_table", schemaName));

		const actual = result.columns.map(column => ({
			name: column.name,
			canonical_name: column.type.canonical_name,
			kind: column.type.kind,
			dimensions: column.type.dimensions,
			// @ts-expect-error union type issue
			domain_base_type: column.type.domain_base_type,
		}));

		const expected: typeof actual = [
			{
				name: "d",
				canonical_name: `${schemaName}.some_domain`,
				kind: CanonicalType.TypeKind.Domain,
				dimensions: 0,
				domain_base_type: {
					canonical_name: "pg_catalog.text",
					name: "text",
					schema: "pg_catalog",
				},
			},
			{
				name: "c",
				canonical_name: `${schemaName}.some_composite`,
				kind: CanonicalType.TypeKind.Composite,
				dimensions: 0,
				domain_base_type: undefined,
			},
			{
				name: "r",
				canonical_name: `${schemaName}.some_range`,
				kind: CanonicalType.TypeKind.Range,
				dimensions: 0,
				domain_base_type: undefined,
			},
			{
				name: "e",
				canonical_name: `${schemaName}.some_enum`,
				kind: CanonicalType.TypeKind.Enum,
				dimensions: 0,
				domain_base_type: undefined,
			},
			{
				name: "d_a",
				canonical_name: `${schemaName}.some_domain`,
				kind: CanonicalType.TypeKind.Domain,
				dimensions: 1,
				domain_base_type: {
					canonical_name: "pg_catalog.text",
					name: "text",
					schema: "pg_catalog",
				},
			},
			{
				name: "c_a",
				canonical_name: `${schemaName}.some_composite`,
				kind: CanonicalType.TypeKind.Composite,
				dimensions: 1,
				domain_base_type: undefined,
			},
			{
				name: "r_a",
				canonical_name: `${schemaName}.some_range`,
				kind: CanonicalType.TypeKind.Range,
				dimensions: 1,
				domain_base_type: undefined,
			},
			{
				name: "e_a",
				canonical_name: `${schemaName}.some_enum`,
				kind: CanonicalType.TypeKind.Enum,
				dimensions: 1,
				domain_base_type: undefined,
			},
		];

		expect(actual).toEqual(expected);
	});

	describe("references", () => {
		const schemaName = useTestSchema(getDbAdapter);
		const secondarySchemaName = useTestSchema(getDbAdapter);

		it("should extract a simple foreign key", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);
			await db.query(
				`create table ${schemaName}.linking_table (some_table_id integer references ${schemaName}.some_table(id))`,
			);

			const result = await extractTable(
				db,
				makePgType("linking_table", schemaName),
			);

			const expected: ColumnReference = {
				schemaName,
				tableName: "some_table",
				columnName: "id",
				onDelete: "NO ACTION",
				onUpdate: "NO ACTION",
				name: "linking_table_some_table_id_fkey",
			};
			expect(result.columns[0]!.references).toEqual([expected]);
		});

		it("should extract a foreign key with a different schema", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${secondarySchemaName}.some_table (id integer primary key)`,
			);
			await db.query(
				`create table ${schemaName}.linking_table (some_table_id integer references ${secondarySchemaName}.some_table(id))`,
			);

			const result = await extractTable(
				db,
				makePgType("linking_table", schemaName),
			);

			const expected: ColumnReference = {
				schemaName: secondarySchemaName,
				tableName: "some_table",
				columnName: "id",
				onDelete: "NO ACTION",
				onUpdate: "NO ACTION",
				name: "linking_table_some_table_id_fkey",
			};
			expect(result.columns[0]!.references).toEqual([expected]);
		});

		it("should get the onDelete and onUpdate actions", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);
			await db.query(
				`create table ${schemaName}.linking_table (some_table_id integer references ${schemaName}.some_table(id) on delete cascade on update set null)`,
			);

			const result = await extractTable(
				db,
				makePgType("linking_table", schemaName),
			);

			const expected: ColumnReference = {
				schemaName,
				tableName: "some_table",
				columnName: "id",
				onDelete: "CASCADE",
				onUpdate: "SET NULL",
				name: "linking_table_some_table_id_fkey",
			};
			expect(result.columns[0]!.references).toEqual([expected]);
		});
	});

	describe("indices", () => {
		it("should extract a simple index", async () => {
			const db = getDbAdapter();
			await db.query(`create table ${schemaName}.some_table (id integer)`);
			await db.query(
				`create index some_table_id_idx on ${schemaName}.some_table (id)`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableIndex[] = [
				{
					name: "some_table_id_idx",
					isPrimary: false,
					isUnique: false,
					columns: [
						{
							name: "id",
							definition: "id",
						},
					],
				},
			];

			expect(result.indices).toStrictEqual(expected);
		});

		it("should extract a unique index", async () => {
			const db = getDbAdapter();
			await db.query(`create table ${schemaName}.some_table (id integer)`);
			await db.query(
				`create unique index some_table_id_idx on ${schemaName}.some_table (id)`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableIndex[] = [
				{
					name: "some_table_id_idx",
					isPrimary: false,
					isUnique: true,
					columns: [
						{
							name: "id",
							definition: "id",
						},
					],
				},
			];

			expect(result.indices).toStrictEqual(expected);
		});

		it("it should extract a primary key", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableIndex[] = [
				{
					name: "some_table_pkey",
					isPrimary: true,
					isUnique: true,
					columns: [
						{
							name: "id",
							definition: "id",
						},
					],
				},
			];

			expect(result.indices).toStrictEqual(expected);
		});

		it("should extract a multi-column index", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer, kind integer)`,
			);
			await db.query(
				`create index some_table_id_idx on ${schemaName}.some_table (id, kind)`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableIndex[] = [
				{
					name: "some_table_id_idx",
					isPrimary: false,
					isUnique: false,
					columns: [
						{
							name: "id",
							definition: "id",
						},
						{
							name: "kind",
							definition: "kind",
						},
					],
				},
			];

			expect(result.indices).toStrictEqual(expected);
		});

		it("should extract a functional index", async () => {
			const db = getDbAdapter();
			await db.query(`create table ${schemaName}.some_table (id integer)`);
			await db.query(
				`create index some_table_id_idx on ${schemaName}.some_table (abs(id))`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableIndex[] = [
				{
					name: "some_table_id_idx",
					isPrimary: false,
					isUnique: false,
					columns: [
						{
							name: null,
							definition: "abs(id)",
						},
					],
				},
			];

			expect(result.indices).toStrictEqual(expected);
		});
	});

	describe("row-level security", () => {
		it("should extract isRowLevelSecurityEnabled", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);
			await db.query(
				`alter table ${schemaName}.some_table enable row level security`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			expect(result.isRowLevelSecurityEnabled).toEqual(true);
			expect(result.isRowLevelSecurityEnforced).toEqual(false);
		});

		it("should extract isRowLevelSecurityEnforced", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);
			await db.query(
				`alter table ${schemaName}.some_table force row level security`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			expect(result.isRowLevelSecurityEnabled).toEqual(false);
			expect(result.isRowLevelSecurityEnforced).toEqual(true);
		});
	});

	describe("securityPolicies", () => {
		it("should extract empty array when no policy is defined", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableSecurityPolicy[] = [];
			expect(result.securityPolicies).toEqual(expected);
		});

		it("it should extract a simple security policy", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);
			await db.query(`create policy test_policy on ${schemaName}.some_table`);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableSecurityPolicy[] = [
				{
					name: "test_policy",
					isPermissive: true,
					rolesAppliedTo: ["public"],
					commandType: "ALL",
					visibilityExpression: null,
					modifiabilityExpression: null,
				},
			];
			expect(result.securityPolicies).toEqual(expected);
		});

		it("it should extract a complex security policy", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);
			await db.query("create role test_role");
			await db.query(
				`create policy test_policy on ${schemaName}.some_table as restrictive for update to test_role, postgres using (id = 1) with check (true)`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableSecurityPolicy[] = [
				{
					name: "test_policy",
					isPermissive: false,
					rolesAppliedTo: ["postgres", "test_role"],
					commandType: "UPDATE",
					visibilityExpression: "(id = 1)",
					modifiabilityExpression: "true",
				},
			];
			expect(result.securityPolicies).toEqual(expected);
		});
	});

	describe("bugfixes", () => {
		const secondarySchemaName = useTestSchema(getDbAdapter);

		it("should not report duplicate columns when a column has multiple foreign key constraints", async () => {
			const db = getDbAdapter();
			await db.query(
				`create table ${schemaName}.some_table (id integer primary key)`,
			);
			await db.query(
				`create table ${schemaName}.linking_table (
		  some_table_id integer,
		  constraint "fk_1" foreign key ("some_table_id") references ${schemaName}.some_table(id),
		  constraint "fk_2" foreign key ("some_table_id") references ${schemaName}.some_table(id)
		)`,
			);

			const result = await extractTable(
				db,
				makePgType("linking_table", schemaName),
			);

			expect(result.columns).toHaveLength(1);

			expect(result.columns[0]!.references).toStrictEqual([
				{
					schemaName,
					tableName: "some_table",
					columnName: "id",
					onDelete: "NO ACTION",
					onUpdate: "NO ACTION",
					name: "fk_1",
				},
				{
					schemaName,
					tableName: "some_table",
					columnName: "id",
					onDelete: "NO ACTION",
					onUpdate: "NO ACTION",
					name: "fk_2",
				},
			]);
		});

		it("should not extract indices from another schema", async () => {
			const db = getDbAdapter();
			await db.query(`create table ${schemaName}.some_table (id integer)`);
			await db.query(
				`create index some_table_id_idx on ${schemaName}.some_table (id)`,
			);
			await db.query(
				`create table ${secondarySchemaName}.some_table (id integer)`,
			);
			await db.query(
				`create index some_table_id_idx2 on ${secondarySchemaName}.some_table (id)`,
			);

			const result = await extractTable(
				db,
				makePgType("some_table", schemaName),
			);

			const expected: TableIndex[] = [
				{
					columns: [
						{
							definition: "id",
							name: "id",
						},
					],
					isPrimary: false,
					isUnique: false,
					name: "some_table_id_idx",
				},
			];

			expect(result.indices).toStrictEqual(expected);
		});
	});
});
