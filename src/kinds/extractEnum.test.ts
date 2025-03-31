import { describe, expect, it } from "vitest";

import useSchema from "../tests/useSchema.ts";
import useTestDbAdapter from "../tests/useTestDbAdapter.ts";
import type { EnumDetails } from "./extractEnum.ts";
import extractEnum from "./extractEnum.ts";
import type { PgType } from "./PgType.ts";

const makePgType = (name: string, schemaName = "test"): PgType<"enum"> => ({
	schemaName,
	name,
	kind: "enum",
	comment: null,
});

describe("extractEnum", () => {
	const [getDbAdapter] = useTestDbAdapter();
	useSchema(getDbAdapter, "test");

	it("should extract enum values", async () => {
		const db = getDbAdapter();
		await db.query("create type test.some_enum as enum('a', 'b', 'c')");

		const result = await extractEnum(db, makePgType("some_enum"));

		const expected: EnumDetails = {
			name: "some_enum",
			schemaName: "test",
			kind: "enum",
			comment: null,
			values: ["a", "b", "c"],
		};
		expect(result).toStrictEqual(expected);
	});
});
