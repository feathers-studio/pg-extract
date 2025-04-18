import { describe, expect, it } from "vitest";

import useTestSchema from "../tests/useSchema.js";
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

describe.skip("extractRange", () => {
	const [getDbAdapter] = useTestDbAdapter();
	const schemaName = useTestSchema(getDbAdapter);

	it("should extract range values", async () => {
		const db = getDbAdapter();
		await db.query("create type test.some_range as range(subtype=timestamptz)");

		const result = await extractRange(db, makePgType("some_range"));

		const expected: RangeDetails = {
			name: "some_range",
			schemaName,
			kind: "range",
			comment: null,
			innerType: "pg_catalog.timestamptz",
		};
		expect(result).toStrictEqual(expected);
	});
});
