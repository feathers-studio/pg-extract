import * as R from "ramda";
import { describe, expect, it } from "vitest";

import useSchema from "../tests/useSchema.ts";
import useTestKnex from "../tests/useTestKnex.ts";
import type {
  CompositeTypeAttribute,
  CompositeTypeDetails,
} from "./extractCompositeType.ts";
import extractCompositeType from "./extractCompositeType.ts";
import type PgType from "./PgType.ts";
import { CanonicalType } from "./query-parts/canonicaliseTypes.ts";

const makePgType = (
  name: string,
  schemaName = "test",
): PgType<"composite"> => ({
  schemaName,
  name,
  kind: "composite",
  comment: null,
});

describe("extractCompositeType", () => {
  const [getKnex, databaseName] = useTestKnex();
  useSchema(getKnex, "test");

  it("should extract simplified information", async () => {
    const db = getKnex();
    await db.raw("create type test.some_composite_type as (id integer)");

    const result = await extractCompositeType(
      db,
      makePgType("some_composite_type"),
    );

    const actual = (result as CompositeTypeDetails).canonical.attributes.map(
      (attribute) => ({
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
    const db = getKnex();
    await db.raw(
      "create type test.some_composite_type as (id integer, name text)",
    );
    await db.raw(
      "comment on column test.some_composite_type.id is 'id column'",
    );

    const result = await extractCompositeType(
      db,
      makePgType("some_composite_type"),
    );

    expect(
      (result as CompositeTypeDetails).canonical.attributes[0].comment,
    ).toBe("id column");
  });

  it("should handle domains, composite types, ranges and enums as well as arrays of those", async () => {
    const db = getKnex();
    await db.raw("create domain test.some_domain as text");
    await db.raw("create type test.some_composite as (id integer, name text)");
    await db.raw("create type test.some_range as range(subtype=timestamptz)");
    await db.raw("create type test.some_enum as enum ('a', 'b', 'c')");

    await db.raw(
      `create type test.some_composite_type as (
        d test.some_domain,
        c test.some_composite,
        r test.some_range,
        e test.some_enum,
        d_a test.some_domain[],
        c_a test.some_composite[],
        r_a test.some_range[],
        e_a test.some_enum[]
    )`,
    );

    const result = await extractCompositeType(
      db,
      makePgType("some_composite_type"),
    );

    const actual = (result as CompositeTypeDetails).canonical.attributes.map(
      (attribute) => ({
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
          canonical_name: "test.some_domain",
          kind: CanonicalType.TypeKind.Domain,
          dimensions: 0,
        },
      },
      {
        name: "c",
        type: {
          canonical_name: "test.some_composite",
          kind: CanonicalType.TypeKind.Composite,
          dimensions: 0,
        },
      },
      {
        name: "r",
        type: {
          canonical_name: "test.some_range",
          kind: CanonicalType.TypeKind.Range,
          dimensions: 0,
        },
      },
      {
        name: "e",
        type: {
          canonical_name: "test.some_enum",
          kind: CanonicalType.TypeKind.Enum,
          dimensions: 0,
        },
      },
      {
        name: "d_a",
        type: {
          canonical_name: "test.some_domain",
          kind: CanonicalType.TypeKind.Domain,
          dimensions: 1,
        },
      },
      {
        name: "c_a",
        type: {
          canonical_name: "test.some_composite",
          kind: CanonicalType.TypeKind.Composite,
          dimensions: 1,
        },
      },
      {
        name: "r_a",
        type: {
          canonical_name: "test.some_range",
          kind: CanonicalType.TypeKind.Range,
          dimensions: 1,
        },
      },
      {
        name: "e_a",
        type: {
          canonical_name: "test.some_enum",
          kind: CanonicalType.TypeKind.Enum,
          dimensions: 1,
        },
      },
    ];

    expect(actual).toEqual(expected);
  });
});
