import { describe, expect, it } from "vitest";

import useTestSchema from "../tests/useSchema.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";
import type { DomainDetails } from "./extractDomain.ts";
import extractDomain from "./extractDomain.ts";
import type { PgType } from "./PgType.ts";

const makePgType = (name: string, schemaName: string): PgType<"domain"> => ({
	schemaName,
	name,
	kind: "domain",
	comment: null,
});

describe("extractDomain", () => {
	const [getDbAdapter, databaseName] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should extract simplified as well as full information_schema information", async () => {
		const db = getDbAdapter();
		await db.query(`create domain ${schemaName}.some_domain as integer`);

		const result = await extractDomain(
			db,
			makePgType("some_domain", schemaName),
		);

		const expected: DomainDetails = {
			name: "some_domain",
			schemaName,
			kind: "domain",
			comment: null,
			innerType: "pg_catalog.int4",
			informationSchemaValue: {
				domain_catalog: databaseName,
				domain_schema: schemaName,
				domain_name: "some_domain",
				data_type: "integer",
				character_maximum_length: null,
				character_octet_length: null,
				character_set_catalog: null,
				character_set_schema: null,
				character_set_name: null,
				collation_catalog: null,
				collation_schema: null,
				collation_name: null,
				numeric_precision: 32,
				numeric_precision_radix: 2,
				numeric_scale: 0,
				datetime_precision: null,
				interval_type: null,
				interval_precision: null,
				domain_default: null,
				udt_catalog: databaseName,
				udt_schema: "pg_catalog",
				udt_name: "int4",
				scope_catalog: null,
				scope_schema: null,
				scope_name: null,
				maximum_cardinality: null,
				dtd_identifier: "1",
			},
		};
		expect(result).toStrictEqual(expected);
	});
});
