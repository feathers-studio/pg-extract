import type { Knex } from "knex";

import type InformationSchemaRoutine from "../information_schema/InformationSchemaRoutine";
import { parsePostgresArray } from "./parsePostgresArray";
import type PgType from "./PgType";
import type { TableColumnType } from "./extractTable";

export type FunctionReturnType = TableColumnType & {
  /**
   * Whether the function returns a set of values (multiple rows).
   */
  isSet: boolean;
  /**
   * Whether the function's return type is an array.
   */
  isArray: boolean;
  /**
   * Number of dimensions if the return type is an array, 0 otherwise.
   */
  dimensions: number;
  /**
   * For table/composite returns, contains the column definitions
   */
  columns?: TableColumn[];
  /**
   * Indicates if this is a table return type
   */
  isTable?: boolean;
};

const parameterModeMap = {
  i: "IN",
  o: "OUT",
  b: "INOUT",
  v: "VARIADIC",
  t: "TABLE",
} as const;

type ParameterMode = (typeof parameterModeMap)[keyof typeof parameterModeMap];

export type FunctionParameter = {
  name: string;
  type: string;
  typeInfo: TableColumnType;
  mode: ParameterMode;
  hasDefault: boolean;
  ordinalPosition: number;
};

const volatilityMap = {
  i: "IMMUTABLE",
  s: "STABLE",
  v: "VOLATILE",
} as const;

type FunctionVolatility = (typeof volatilityMap)[keyof typeof volatilityMap];

const parallelSafetyMap = {
  s: "SAFE",
  r: "RESTRICTED",
  u: "UNSAFE",
} as const;

type FunctionParallelSafety =
  (typeof parallelSafetyMap)[keyof typeof parallelSafetyMap];

interface TableColumn {
  name: string;
  type: string;
  typeInfo: TableColumnType;
}

interface TableReturnType {
  type: "table";
  columns: TableColumn[];
}

export interface FunctionDetails extends PgType<"function"> {
  parameters: FunctionParameter[];
  returnType: string | TableReturnType;
  returnTypeInfo: FunctionReturnType;
  language: string;
  definition: string;
  isStrict: boolean;
  isSecurityDefiner: boolean;
  isLeakProof: boolean;
  returnsSet: boolean;
  volatility: FunctionVolatility;
  parallelSafety: FunctionParallelSafety;
  estimatedCost: number;
  estimatedRows: number | null;
  comment: string | null;
  informationSchemaValue: InformationSchemaRoutine;
}

async function extractFunction(
  db: Knex,
  pgType: PgType<"function">,
): Promise<FunctionDetails[]> {
  const [informationSchemaValue] = await db
    .from("information_schema.routines")
    .where({
      routine_name: pgType.name,
      routine_schema: pgType.schemaName,
    })
    .select("*");

  const { rows } = await db.raw(
    `
    SELECT
      p.proname,
      ns.nspname || '.' || t.typname AS return_type,
      l.lanname AS language,
      p.prosrc AS definition,
      p.proisstrict AS is_strict,
      p.prosecdef AS is_security_definer,
      p.proleakproof AS is_leak_proof,
      p.proretset AS returns_set,
      p.provolatile,
      p.proparallel,
      p.procost AS estimated_cost,
      CASE WHEN p.proretset THEN p.prorows ELSE NULL END AS estimated_rows,
      d.description AS comment,
      p.proargmodes,
      p.proargnames,
      p.prorettype,
      array_to_string(COALESCE(p.proallargtypes::regtype[], p.proargtypes::regtype[]), ',') AS arg_types,
      (
        SELECT json_agg(json_build_object(
          'fullName', nsp.nspname || '.' || typ.typname,
          'kind', CASE 
            WHEN typ.typtype = 'd' THEN 'domain'
            WHEN typ.typtype = 'r' THEN 'range'
            WHEN typ.typtype = 'c' THEN 'composite'
            WHEN typ.typtype = 'e' THEN 'enum'
            WHEN typ.typtype = 'b' THEN 'base'
            ELSE 'base'
          END
        ) ORDER BY a.ord)
        FROM unnest(COALESCE(p.proallargtypes, p.proargtypes)) WITH ORDINALITY AS a(oid, ord)
        JOIN pg_type typ ON a.oid = typ.oid
        JOIN pg_namespace nsp ON typ.typnamespace = nsp.oid
      ) AS arg_type_info,
      p.pronargdefaults,
      pg_get_function_arguments(p.oid) AS arg_list,
      pg_get_function_identity_arguments(p.oid) AS identity_args,
      pg_get_function_result(p.oid) as full_return_type,
      (
        SELECT json_build_object(
          'fullName', nsp.nspname || '.' || typ.typname,
          'kind', CASE 
            WHEN typ.typtype = 'd' THEN 'domain'
            WHEN typ.typtype = 'r' THEN 'range'
            WHEN typ.typtype = 'c' THEN 'composite'
            WHEN typ.typtype = 'e' THEN 'enum'
            WHEN typ.typtype = 'b' THEN 'base'
            ELSE 'base'
          END
        )
        FROM pg_type typ
        JOIN pg_namespace nsp ON typ.typnamespace = nsp.oid
        WHERE typ.oid = p.prorettype
      ) AS return_type_info,
      (t.typelem != 0) AS returns_array,
      COALESCE(t.typndims, 0) AS return_dimensions,
      t.typelem
    FROM pg_proc p
    LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_description d ON d.objoid = p.oid
    LEFT JOIN pg_language l ON l.oid = p.prolang
    LEFT JOIN pg_type t ON t.oid = p.prorettype
    LEFT JOIN pg_namespace ns ON t.typnamespace = ns.oid
    WHERE n.nspname = ? AND p.proname = ?`,
    [pgType.schemaName, pgType.name],
  );

  return Promise.all(
    (rows as any[]).map(async (row) => {
      const argTypes = (
        row.arg_types ? row.arg_types.split(",") : []
      ) as string[];

      const paramModes = row.proargmodes
        ? parsePostgresArray(String(row.proargmodes))
        : argTypes.map(() => "i");

      const paramNames = row.proargnames
        ? parsePostgresArray(String(row.proargnames))
        : argTypes.map((_, i) => `$${i + 1}`);

      const argTypeInfo = row.arg_type_info ?? [];

      const parameters: FunctionParameter[] = argTypes.map(
        (type: string, i: number) => ({
          name: paramNames[i],
          type: type,
          typeInfo: argTypeInfo[i],
          mode: parameterModeMap[
            paramModes[i] as keyof typeof parameterModeMap
          ],
          hasDefault: i >= argTypes.length - (row.pronargdefaults || 0),
          ordinalPosition: i + 1,
        }),
      );

      let returnType: string | TableReturnType = row.return_type;
      let returnTypeInfo: FunctionReturnType = {
        ...(row.return_type_info || {
          fullName: row.return_type || "",
          kind: "base",
        }),
        isSet: row.returns_set,
        isArray: row.returns_array || false,
        dimensions: row.return_dimensions || 0,
      };

      if (
        row.full_return_type &&
        row.full_return_type.toLowerCase().includes("table")
      ) {
        const tableMatch = (row.full_return_type as string).match(
          /TABLE\((.*)\)/i,
        );
        if (tableMatch) {
          // Parse column definitions from the RETURNS TABLE(...) syntax
          const columnDefs = tableMatch[1].split(",").map((col) => {
            const [name, typeStr] = col.trim().split(/\s+/);
            return { name, type: typeStr };
          });

          try {
            // For functions with RETURNS TABLE, the column types are specified in the function definition
            // We need to look up the type information for each column type string
            const enhancedColumnDefs = await Promise.all(
              columnDefs.map(async (col) => {
                try {
                  // Clean up the type name (remove size parameters, etc.)
                  let baseType = col.type
                    .replace(/\[\]$/, "") // Remove array notation
                    .replace(/\(\d+(?:,\d+)?\)/, "") // Remove size parameters like varchar(255) or numeric(10,2)
                    .toLowerCase();

                  // Special case handling for common type names with schema prefixes
                  if (!baseType.includes(".")) {
                    // Most types are in pg_catalog schema if not explicitly prefixed
                    baseType = `pg_catalog.${baseType}`;
                  }

                  const { rows: typeInfoRows } = await db.raw(
                    `
                    SELECT 
                      t.typname AS name,
                      n.nspname AS schema,
                      json_build_object(
                        'fullName', n.nspname || '.' || t.typname,
                        'kind', CASE 
                          WHEN t.typtype = 'd' THEN 'domain'
                          WHEN t.typtype = 'r' THEN 'range'
                          WHEN t.typtype = 'c' THEN 'composite'
                          WHEN t.typtype = 'e' THEN 'enum'
                          WHEN t.typtype = 'b' THEN 'base'
                          ELSE 'base'
                        END
                      ) AS type_info
                    FROM pg_type t
                    JOIN pg_namespace n ON t.typnamespace = n.oid
                    WHERE format_type(t.oid, NULL) = $1
                       OR n.nspname || '.' || t.typname = $2
                    LIMIT 1;
                  `,
                    [baseType, baseType],
                  );

                  // If we found type info, use it
                  if (typeInfoRows && typeInfoRows.length > 0) {
                    return {
                      name: col.name,
                      type: col.type,
                      typeInfo: typeInfoRows[0].type_info,
                    };
                  }

                  // Fallback: try just the type name without schema
                  const typeName = baseType.split(".").pop() || baseType;
                  const { rows: fallbackRows } = await db.raw(
                    `
                    SELECT 
                      t.typname AS name,
                      n.nspname AS schema,
                      json_build_object(
                        'fullName', n.nspname || '.' || t.typname,
                        'kind', CASE 
                          WHEN t.typtype = 'd' THEN 'domain'
                          WHEN t.typtype = 'r' THEN 'range'
                          WHEN t.typtype = 'c' THEN 'composite'
                          WHEN t.typtype = 'e' THEN 'enum'
                          WHEN t.typtype = 'b' THEN 'base'
                          ELSE 'base'
                        END
                      ) AS type_info
                    FROM pg_type t
                    JOIN pg_namespace n ON t.typnamespace = n.oid
                    WHERE t.typname = $1
                    ORDER BY n.nspname = 'pg_catalog' DESC
                    LIMIT 1;
                  `,
                    [typeName],
                  );

                  return {
                    name: col.name,
                    type: col.type,
                    typeInfo: fallbackRows[0]?.type_info || {
                      fullName: `pg_catalog.${typeName}`,
                      kind: "base",
                    },
                  };
                } catch (e) {
                  // If type lookup fails, provide a sensible default
                  return {
                    name: col.name,
                    type: col.type,
                    typeInfo: {
                      fullName: `pg_catalog.${col.type}`,
                      kind: "base",
                    },
                  };
                }
              }),
            );

            returnType = {
              type: "table",
              columns: enhancedColumnDefs,
            };

            returnTypeInfo = {
              ...returnTypeInfo,
              kind: "composite",
              isTable: true,
              columns: enhancedColumnDefs,
            };
          } catch (error) {
            // Fallback to basic column definitions if the lookup fails
            console.warn(
              "Could not fetch detailed column type information, falling back to basic column definitions:",
              error,
            );

            const basicColumns = columnDefs.map((col) => ({
              name: col.name,
              type: col.type,
              typeInfo: {
                fullName: `pg_catalog.${col.type.toLowerCase()}`,
                kind: "base",
              },
            }));

            returnType = {
              type: "table",
              columns: basicColumns,
            };

            returnTypeInfo = {
              ...returnTypeInfo,
              kind: "composite",
              isTable: true,
              columns: basicColumns,
            };
          }
        }
      }

      return {
        ...pgType,
        parameters,
        returnType,
        returnTypeInfo,
        language: row.language,
        definition: row.definition,
        isStrict: row.is_strict,
        isSecurityDefiner: row.is_security_definer,
        isLeakProof: row.is_leak_proof,
        returnsSet: row.returns_set,
        volatility: volatilityMap[
          row.provolatile as keyof typeof volatilityMap
        ] as FunctionVolatility,
        parallelSafety: parallelSafetyMap[
          row.proparallel as keyof typeof parallelSafetyMap
        ] as FunctionParallelSafety,
        estimatedCost: row.estimated_cost,
        estimatedRows: row.estimated_rows,
        comment: row.comment,
        informationSchemaValue,
      };
    }),
  );
}

export default extractFunction;
