import { Client } from "pg";

import type InformationSchemaDomain from "../information_schema/InformationSchemaDomain.ts";
import type PgType from "./PgType.ts";

/**
 * Domain type in a schema.
 */
export interface DomainDetails extends PgType<"domain"> {
  /**
   * Qualified name of the inner type of the domain.
   */
  innerType: string;

  /**
   * Information schema value for the domain.
   */
  informationSchemaValue: InformationSchemaDomain;
}

const extractDomain = async (
  pg: Client,
  domain: PgType<"domain">,
): Promise<DomainDetails> => {
  const query = await pg.query<
    {
      innerType: string;
      informationSchemaValue: InformationSchemaDomain;
    },
    [domain_name: string, schema_name: string]
  >(
    `
    SELECT
      i.typnamespace::regnamespace::text||'.'||i.typname as "innerType",
      row_to_json(domains.*) AS "informationSchemaValue"
    FROM
      information_schema.domains,
      pg_type t
    JOIN pg_type i on t.typbasetype = i.oid
    WHERE
      domain_name = $1
      AND t.typname = $1
      AND t.typtype = 'd'
      AND domain_schema = $2
      AND t.typnamespace::regnamespace::text = $2
    `,
    [domain.name, domain.schemaName],
  );

  return {
    ...domain,
    ...query.rows[0],
  };
};

export default extractDomain;
