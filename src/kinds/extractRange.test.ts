import { describe, expect, it } from "vitest";

import useSchema from "../tests/useSchema.js";
import useTestDbAdapter from "../tests/useTestDbAdapter.js";
import type { RangeDetails } from "./extractRange.js";
import extractRange from "./extractRange.js";
import type { PgType } from "./PgType.js";

const makePgType = (name: string, schemaName = "test"): PgType<"range"> => ({
	schemaName,
	name,
	kind: "range",
	comment: null,
});

describe("extractRange", () => {
	const [getDbAdapter] = useTestDbAdapter();
	useSchema(getDbAdapter, "test");

	it("should extract range values", async () => {
		const db = getDbAdapter();
		await db.query("create type test.some_range as range(subtype=timestamptz)");

		const result = await extractRange(db, makePgType("some_range"));

		const expected: RangeDetails = {
			name: "some_range",
			schemaName: "test",
			kind: "range",
			comment: null,
			innerType: "pg_catalog.timestamptz",
		};
		expect(result).toStrictEqual(expected);
	});
});
