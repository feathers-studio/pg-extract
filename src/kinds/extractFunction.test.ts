import { describe, expect, it } from "vitest";

import type { InformationSchemaRoutine } from "../information_schema/InformationSchemaRoutine.ts";
import useTestSchema from "../tests/useSchema.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";
import type { FunctionDetails } from "./extractFunction.ts";
import extractFunction, { FunctionReturnTypeKind } from "./extractFunction.ts";
import type { PgType } from "./PgType.ts";
import { CanonicalType } from "./query-parts/canonicaliseTypes.ts";

const makePgType = (name: string, schemaName: string): PgType<"function"> => ({
	schemaName,
	name,
	kind: "function",
	comment: null,
});

describe("extractFunction", () => {
	const [getDbAdapter] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should extract function details", async () => {
		const db = getDbAdapter();
		await db.query(
			`create function ${schemaName}.some_function() returns text as $$ BEGIN return 'hello'; END; $$ language plpgsql`,
		);

		const result = await extractFunction(
			db,
			makePgType("some_function", schemaName),
		);

		const expected: FunctionDetails = {
			schemaName,
			name: "some_function",
			kind: "function",
			comment: null,
			parameters: [],
			returnType: {
				kind: FunctionReturnTypeKind.Regular,
				isSet: false,
				type: {
					schema: "pg_catalog",
					name: "text",
					original_type: "pg_catalog.text",
					canonical_name: "pg_catalog.text",
					kind: CanonicalType.TypeKind.Base,
					dimensions: 0,
				},
			},
			language: "plpgsql",
			definition: " BEGIN return 'hello'; END; ",
			isStrict: false,
			isSecurityDefiner: false,
			isLeakProof: false,
			volatility: "VOLATILE",
			parallelSafety: "UNSAFE",
			estimatedCost: 100,
			estimatedRows: null,
			informationSchemaValue: {
				specific_schema: schemaName,
				routine_schema: schemaName,
				routine_name: "some_function",
				routine_type: "FUNCTION",
				module_catalog: null,
				module_schema: null,
				module_name: null,
				udt_catalog: null,
				udt_schema: null,
				udt_name: null,
				data_type: "text",
				character_maximum_length: null,
				character_octet_length: null,
				character_set_catalog: null,
				character_set_schema: null,
				character_set_name: null,
				collation_catalog: null,
				collation_schema: null,
				collation_name: null,
				numeric_precision: null,
				numeric_precision_radix: null,
				numeric_scale: null,
				datetime_precision: null,
				interval_type: null,
				interval_precision: null,
				type_udt_schema: "pg_catalog",
				type_udt_name: "text",
				scope_catalog: null,
				scope_schema: null,
				scope_name: null,
				maximum_cardinality: null,
				dtd_identifier: "0",
				routine_body: "EXTERNAL",
				routine_definition: " BEGIN return 'hello'; END; ",
				external_name: null,
				external_language: "PLPGSQL",
				parameter_style: "GENERAL",
				is_deterministic: "NO",
				sql_data_access: "MODIFIES",
				is_null_call: "NO",
				sql_path: null,
				schema_level_routine: "YES",
				max_dynamic_result_sets: 0,
				is_user_defined_cast: null,
				is_implicitly_invocable: null,
				security_type: "INVOKER",
				to_sql_specific_catalog: null,
				to_sql_specific_schema: null,
				to_sql_specific_name: null,
				as_locator: "NO",
				created: null,
				last_altered: null,
				new_savepoint_level: null,
				is_udt_dependent: "NO",
				result_cast_from_data_type: null,
				result_cast_as_locator: null,
				result_cast_char_max_length: null,
				result_cast_char_octet_length: null,
				result_cast_char_set_catalog: null,
				result_cast_char_set_schema: null,
				result_cast_char_set_name: null,
				result_cast_collation_catalog: null,
				result_cast_collation_schema: null,
				result_cast_collation_name: null,
				result_cast_numeric_precision: null,
				result_cast_numeric_precision_radix: null,
				result_cast_numeric_scale: null,
				result_cast_datetime_precision: null,
				result_cast_interval_type: null,
				result_cast_interval_precision: null,
				result_cast_type_udt_catalog: null,
				result_cast_type_udt_schema: null,
				result_cast_type_udt_name: null,
				result_cast_scope_catalog: null,
				result_cast_scope_schema: null,
				result_cast_scope_name: null,
				result_cast_maximum_cardinality: null,
				result_cast_dtd_identifier: null,
			} as InformationSchemaRoutine,
		};
		expect(result[0]).toMatchObject(expected);
	});

	it("should extract function details with arguments", async () => {
		const db = getDbAdapter();
		await db.query(
			`create function ${schemaName}.some_function(text) returns text as $$ BEGIN return $1; END; $$ language plpgsql`,
		);

		const result = await extractFunction(
			db,
			makePgType("some_function", schemaName),
		);

		const expected: Partial<FunctionDetails> = {
			schemaName,
			name: "some_function",
			kind: "function",
			comment: null,
			parameters: [
				{
					name: "$1",
					type: {
						schema: "pg_catalog",
						name: "text",
						original_type: "text",
						canonical_name: "pg_catalog.text",
						kind: CanonicalType.TypeKind.Base,
						dimensions: 0,
					},
					mode: "IN",
					hasDefault: false,
					ordinalPosition: 1,
				},
			],
			returnType: {
				kind: FunctionReturnTypeKind.Regular,
				isSet: false,
				type: {
					canonical_name: "pg_catalog.text",
					kind: CanonicalType.TypeKind.Base,
					dimensions: 0,
					original_type: "pg_catalog.text",
					schema: "pg_catalog",
					name: "text",
				},
			},
			language: "plpgsql",
			definition: " BEGIN return $1; END; ",
		};
		expect(result[0]).toMatchObject(expected);
	});

	it("should handle different parameter modes", async () => {
		const db = getDbAdapter();
		await db.query(`
	  create function ${schemaName}.param_modes(
		IN in_param text,
		OUT out_param text,
		INOUT inout_param int,
		VARIADIC var_param text[]
	  ) returns record as $$
	  BEGIN
		out_param := in_param;
		inout_param := inout_param * 2;
	  END;
	  $$ language plpgsql`);

		const result = await extractFunction(
			db,
			makePgType("param_modes", schemaName),
		);

		expect(
			result[0]!.parameters.map(p => ({
				name: p.name,
				mode: p.mode,
				type: p.type.canonical_name,
				dimensions: p.type.dimensions,
			})),
		).toMatchObject([
			{ name: "in_param", mode: "IN", type: "pg_catalog.text", dimensions: 0 },
			{
				name: "out_param",
				mode: "OUT",
				type: "pg_catalog.text",
				dimensions: 0,
			},
			{
				name: "inout_param",
				mode: "INOUT",
				type: "pg_catalog.int4",
				dimensions: 0,
			},
			{
				name: "var_param",
				mode: "VARIADIC",
				type: "pg_catalog.text",
				dimensions: 1,
			},
		]);
	});

	it("should handle complex return types", async () => {
		const db = getDbAdapter();

		await db.query(
			`create type ${schemaName}.complex_type as (id int, name text);`,
		);

		await db.query(`
			create function ${schemaName}.returns_complex()
			returns table(
				id integer,
				name text,
				tags text[],
				metadata json,
				complex ${schemaName}.complex_type
			) as $$
			BEGIN
				-- Function body
			END;
			$$ language plpgsql
		`);

		const result = await extractFunction(
			db,
			makePgType("returns_complex", schemaName),
		);
		const returnType = result[0]!.returnType;
		const columns =
			returnType.kind === FunctionReturnTypeKind.Table
				? returnType.columns
				: [];

		expect(returnType.kind).toBe(FunctionReturnTypeKind.Table);
		expect(
			columns.map(c => ({
				name: c.name,
				type: c.type.canonical_name,
				dimensions: c.type.dimensions,
			})),
		).toMatchObject([
			{ name: "id", type: "pg_catalog.int4", dimensions: 0 },
			{ name: "name", type: "pg_catalog.text", dimensions: 0 },
			{ name: "tags", type: "pg_catalog.text", dimensions: 1 },
			{ name: "metadata", type: "pg_catalog.json", dimensions: 0 },
			{ name: "complex", type: `${schemaName}.complex_type`, dimensions: 0 },
		]);
	});

	it("should handle function attributes", async () => {
		const db = getDbAdapter();
		await db.query(`
	  create function ${schemaName}.with_attributes()
	  returns void
	  language plpgsql
	  strict
	  security definer
	  leakproof
	  stable
	  parallel safe
	  cost 500
	  as $$
	  BEGIN
		-- Function body
	  END;
	  $$`);

		const result = await extractFunction(
			db,
			makePgType("with_attributes", schemaName),
		);

		expect(result[0]).toMatchObject({
			isStrict: true,
			isSecurityDefiner: true,
			isLeakProof: true,
			volatility: "STABLE",
			parallelSafety: "SAFE",
			estimatedCost: 500,
			estimatedRows: null,
		});
	});
});
