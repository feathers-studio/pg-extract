import { Client } from "pg";

import type PgType from "./PgType.ts";

/**
 * Range type in a schema.
 */
export interface RangeDetails extends PgType<"range"> {
  /**
   * Qualified name of the inner type of the range.
   */
  innerType: string;
}

const extractRange = async (
  pg: Client,
  range: PgType<"range">,
): Promise<RangeDetails> => {
  const query = await pg.query<
    { innerType: string },
    [name: string, schemaName: string]
  >(
    `
    SELECT
      subtype.typnamespace::regnamespace::text||'.'||subtype.typname as "innerType"
    FROM
      pg_type range_type
      JOIN pg_namespace ON range_type.typnamespace = pg_namespace.oid
      JOIN pg_range ON range_type.oid = pg_range.rngtypid
      JOIN pg_type subtype ON pg_range.rngsubtype = subtype.oid
    WHERE
      pg_namespace.nspname = $2
      AND range_type.typname = $1
    `,
    [range.name, range.schemaName],
  );

  return {
    ...range,
    ...query.rows[0],
  };
};

export default extractRange;
