import { Client } from "pg";

import fetchExtensionItemIds from "../fetchExtensionItemIds.ts";
import type PgType from "./PgType.ts";
import { classKindMap, typeKindMap } from "./PgType.ts";

const fetchTypes = async (
  pg: Client,
  schemaNames: string[],
): Promise<PgType[]> => {
  // We want to ignore everything belonging to etensions. (Maybe this should be optional?)
  const { extClassOids, extTypeOids } = await fetchExtensionItemIds(pg);

  const typeQuery = (
    await pg.query<{
      name: string;
      schemaName: string;
      kind: PgType["kind"];
      comment: string;
    }>(`
    SELECT
        typname as name,
        nspname as schemaName,
        case typtype
          when 'c' then case relkind
            ${Object.entries(classKindMap)
              .map(([key, classKind]) => `when '${key}' then '${classKind}'`)
              .join("\n")}
            end
          ${Object.entries(typeKindMap)
            .map(([key, typeKind]) => `when '${key}' then '${typeKind}'`)
            .join("\n")}
        end as kind,
        COALESCE(
          obj_description(COALESCE(pg_class.oid, pg_type.oid)),
          obj_description(pg_type.oid)
        ) as comment
      FROM pg_catalog.pg_type
      JOIN pg_catalog.pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      FULL OUTER JOIN pg_catalog.pg_class ON pg_type.typrelid = pg_class.oid
      WHERE (
        pg_class.oid IS NULL
        OR (
          pg_class.relispartition = false
          AND pg_class.relkind NOT IN ('S')
          AND pg_class.oid NOT IN (${extClassOids.join(", ")})
        )
      )
      AND pg_type.oid NOT IN (${extTypeOids.join(", ")})
      AND pg_type.typtype IN ('c', ${Object.keys(typeKindMap)
        .map((key) => `'${key}'`)
        .join(", ")})
      AND pg_namespace.nspname IN (${schemaNames.map((name) => `'${name}'`).join(", ")})
  `)
  ).rows;

  const procQuery = (
    await pg.query<{
      name: string;
      schemaName: string;
      kind: PgType["kind"];
      comment: string;
    }>(`
    SELECT
      proname as name,
      nspname as schemaName,
      case prokind
        when 'f' then 'function'
        when 'p' then 'procedure'
        when 'a' then 'aggregate'
        when 'w' then 'window'
      end as kind,
      obj_description(pg_proc.oid) as comment
    FROM pg_catalog.pg_proc
    JOIN pg_catalog.pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    JOIN pg_catalog.pg_language ON pg_language.oid = pg_proc.prolang
    WHERE pg_proc.oid NOT IN (${extClassOids.join(", ")})
    AND pg_namespace.nspname IN (${schemaNames.map((name) => `'${name}'`).join(", ")})
    AND prokind IN ('f', 'p') -- TODO: Add support for aggregate and window functions
    AND pg_language.lanname != 'internal'
  `)
  ).rows;

  return [...typeQuery, ...procQuery];
};

export default fetchTypes;
