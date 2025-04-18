import { describe, expect, it } from "vitest";

import useTestSchema from "../tests/useSchema.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";
import type { CompositeTypeDetails } from "./extractCompositeType.ts";
import extractCompositeType from "./extractCompositeType.ts";
import type { PgType } from "./PgType.ts";
import { CanonicalType } from "./query-parts/canonicaliseTypes.ts";

const makePgType = (name: string, schemaName: string): PgType<"composite"> => ({
	schemaName,
	name,
	kind: "composite",
	comment: null,
});

describe("extractCompositeType", () => {
	const [getDbAdapter] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should extract simplified information", async () => {
		const db = getDbAdapter();
		await db.query(
			`create type ${schemaName}.some_composite_type as (id integer)`,
		);

		const result = await extractCompositeType(
			db,
			makePgType("some_composite_type", schemaName),
		);

		const actual = (result as CompositeTypeDetails).canonical.attributes.map(
			attribute => ({
				name: attribute.name,
				type: {
					canonical_name: attribute.type.canonical_name,
					kind: attribute.type.kind,
					dimensions: attribute.type.dimensions,
				},
			}),
		);

		const expected: typeof actual = [
			{
				name: "id",
				type: {
					canonical_name: "pg_catalog.int4",
					kind: CanonicalType.TypeKind.Base,
					dimensions: 0,
				},
			},
		];

		expect(actual).toEqual(expected);
	});

	it("should fetch column comments", async () => {
		const db = getDbAdapter();
		await db.query(
			`create type ${schemaName}.some_composite_type as (id integer, name text)`,
		);
		await db.query(
			`comment on column ${schemaName}.some_composite_type.id is 'id column'`,
		);

		const result = await extractCompositeType(
			db,
			makePgType("some_composite_type", schemaName),
		);

		expect(
			(result as CompositeTypeDetails).canonical.attributes[0]!.comment,
		).toBe("id column");
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
			`create type ${schemaName}.some_composite_type as (
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

		const result = await extractCompositeType(
			db,
			makePgType("some_composite_type", schemaName),
		);

		const actual = (result as CompositeTypeDetails).canonical.attributes.map(
			attribute => ({
				name: attribute.name,
				type: {
					canonical_name: attribute.type.canonical_name,
					kind: attribute.type.kind,
					dimensions: attribute.type.dimensions,
				},
			}),
		);

		const expected: typeof actual = [
			{
				name: "d",
				type: {
					canonical_name: `${schemaName}.some_domain`,
					kind: CanonicalType.TypeKind.Domain,
					dimensions: 0,
				},
			},
			{
				name: "c",
				type: {
					canonical_name: `${schemaName}.some_composite`,
					kind: CanonicalType.TypeKind.Composite,
					dimensions: 0,
				},
			},
			{
				name: "r",
				type: {
					canonical_name: `${schemaName}.some_range`,
					kind: CanonicalType.TypeKind.Range,
					dimensions: 0,
				},
			},
			{
				name: "e",
				type: {
					canonical_name: `${schemaName}.some_enum`,
					kind: CanonicalType.TypeKind.Enum,
					dimensions: 0,
				},
			},
			{
				name: "d_a",
				type: {
					canonical_name: `${schemaName}.some_domain`,
					kind: CanonicalType.TypeKind.Domain,
					dimensions: 1,
				},
			},
			{
				name: "c_a",
				type: {
					canonical_name: `${schemaName}.some_composite`,
					kind: CanonicalType.TypeKind.Composite,
					dimensions: 1,
				},
			},
			{
				name: "r_a",
				type: {
					canonical_name: `${schemaName}.some_range`,
					kind: CanonicalType.TypeKind.Range,
					dimensions: 1,
				},
			},
			{
				name: "e_a",
				type: {
					canonical_name: `${schemaName}.some_enum`,
					kind: CanonicalType.TypeKind.Enum,
					dimensions: 1,
				},
			},
		];

		expect(actual).toEqual(expected);
	});
});
