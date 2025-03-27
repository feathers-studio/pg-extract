import { describe, expect, it } from "vitest";

import useSchema from "../tests/useSchema.ts";
import useTestKnex from "../tests/useTestKnex.ts";
import type { RangeDetails } from "./extractRange.ts";
import extractRange from "./extractRange.ts";
import type PgType from "./PgType.ts";

const makePgType = (name: string, schemaName = "test"): PgType<"range"> => ({
  schemaName,
  name,
  kind: "range",
  comment: null,
});

describe("extractRange", () => {
  const [getKnex] = useTestKnex();
  useSchema(getKnex, "test");

  it("should extract range values", async () => {
    const db = getKnex();
    await db.raw("create type test.some_range as range(subtype=timestamptz)");

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
